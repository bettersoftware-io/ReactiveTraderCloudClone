import {
  BehaviorSubject,
  concat,
  EMPTY,
  map,
  type Observable,
  of,
  type Subscription,
  switchMap,
  timer,
} from "rxjs";

import type { JarvisBrain } from "@rtc/domain";
import type { JarvisGateLevel, JarvisUsageSnapshot } from "@rtc/shared";

import type { UsageMeter } from "./UsageMeter.js";

export const DEFAULT_JARVIS_BUDGET_USD = 1;
export const DEFAULT_JARVIS_BUDGET_SOFT_RATIO = 0.8;

/** The expensive brains the soft stage removes; hard removes every real brain. */
const SOFT_GATED: readonly JarvisBrain[] = ["claude-sonnet-5", "claude-opus-5"];
const HARD_GATED: readonly JarvisBrain[] = [
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
];

export interface JarvisGateConfig {
  readonly budgetUsd: number | "off";
  readonly softRatio: number;
  readonly forceLevel: "soft" | "hard" | null;
}

export function parseJarvisGateConfig(
  env: NodeJS.ProcessEnv,
): JarvisGateConfig {
  let budgetUsd: number | "off" = DEFAULT_JARVIS_BUDGET_USD;
  const rawBudget = env.RTC_JARVIS_BUDGET_USD;

  if (rawBudget !== undefined) {
    if (rawBudget === "off") {
      budgetUsd = "off";
    } else if (Number.isFinite(Number(rawBudget)) && Number(rawBudget) > 0) {
      budgetUsd = Number(rawBudget);
    } else {
      console.warn(
        `jarvis-gate: malformed RTC_JARVIS_BUDGET_USD "${rawBudget}", using default`,
      );
    }
  }

  let softRatio = DEFAULT_JARVIS_BUDGET_SOFT_RATIO;
  const rawRatio = env.RTC_JARVIS_BUDGET_SOFT_RATIO;

  if (rawRatio !== undefined) {
    const parsed = Number(rawRatio);

    if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) {
      softRatio = parsed;
    } else {
      console.warn(
        `jarvis-gate: malformed RTC_JARVIS_BUDGET_SOFT_RATIO "${rawRatio}", using default`,
      );
    }
  }

  let forceLevel: "soft" | "hard" | null = null;
  const rawForce = env.RTC_JARVIS_FORCE_GATE;

  if (rawForce !== undefined && rawForce !== "") {
    if (rawForce === "soft" || rawForce === "hard") {
      forceLevel = rawForce;
    } else {
      console.warn(
        `jarvis-gate: malformed RTC_JARVIS_FORCE_GATE "${rawForce}", ignoring`,
      );
    }
  }

  return { budgetUsd, softRatio, forceLevel };
}

export function spentWindowUsd(snapshot: JarvisUsageSnapshot): number {
  return snapshot.currentWindow.reduce((sum, row) => {
    return sum + row.estimatedCostUsd;
  }, 0);
}

/**
 * The single gate decision. Owns the lazy-roll honesty rule: `UsageMeter`
 * only rolls its window when a record arrives, so an elapsed window's
 * snapshot still shows the old spend — `nowMs >= windowEndMs` is "none"
 * regardless of the rows (a fresh meter's windowEndMs of 0 falls out of the
 * same comparison). A forced level wins over everything, including "off".
 */
export function computeGateLevel(
  snapshot: JarvisUsageSnapshot,
  config: JarvisGateConfig,
  nowMs: number,
): JarvisGateLevel {
  if (config.forceLevel !== null) {
    return config.forceLevel;
  }

  if (config.budgetUsd === "off") {
    return "none";
  }

  if (nowMs >= snapshot.windowEndMs) {
    return "none";
  }

  const spent = spentWindowUsd(snapshot);

  if (spent >= config.budgetUsd) {
    return "hard";
  }

  if (spent >= config.budgetUsd * config.softRatio) {
    return "soft";
  }

  return "none";
}

export interface GatedOffer {
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
  readonly gated: readonly JarvisBrain[];
}

/**
 * Narrow an env-capability offer through a gate level. A gate only ever
 * removes; `gated` is the intersection with what was actually offered, so
 * the wire never claims the gate removed a brain env had already removed.
 */
export function applyGateToOffer(
  brains: readonly JarvisBrain[],
  defaultBrain: JarvisBrain,
  level: JarvisGateLevel,
): GatedOffer {
  if (level === "none") {
    return { brains, defaultBrain, gated: [] };
  }

  const removed = level === "soft" ? SOFT_GATED : HARD_GATED;
  const gated = brains.filter((brain) => {
    return removed.includes(brain);
  });

  const surviving = brains.filter((brain) => {
    return !removed.includes(brain);
  });

  const survivingDefault = surviving.includes(defaultBrain)
    ? defaultBrain
    : surviving.includes("claude-haiku-4-5")
      ? "claude-haiku-4-5"
      : "scripted";

  return { brains: surviving, defaultBrain: survivingDefault, gated };
}

export interface JarvisGateState {
  readonly level: JarvisGateLevel;
  /** The meter's windowEndMs at decision time; 0 on a fresh meter. */
  readonly resetsAtMs: number;
}

/**
 * Server-lifetime gate: one shared decision stream over the meter, with a
 * timer-armed lift. Each snapshot emission is re-judged immediately; while
 * the judged level is gated AND the window end is in the future, one timer
 * (per gate episode — switchMap cancels it on the next snapshot) re-judges
 * at windowEndMs so the lifting availability push happens even if nobody
 * talks to Jarvis again. BehaviorSubject-backed so per-turn routing can
 * read `current()` synchronously.
 */
// eslint-disable-next-line rtc/class-filename-match -- co-located with the pure gate-math functions it wraps (computeGateLevel, applyGateToOffer, parseJarvisGateConfig) in one small purpose-named service module, mirroring UsageMeter's role as the file's single cohesive export surface
export class JarvisGateService {
  private readonly stateSubject: BehaviorSubject<JarvisGateState>;

  private readonly subscription: Subscription;

  readonly config: JarvisGateConfig;

  constructor(
    meter: Pick<UsageMeter, "snapshot$">,
    config: JarvisGateConfig,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.stateSubject = new BehaviorSubject<JarvisGateState>({
      level: "none",
      resetsAtMs: 0,
    });
    this.subscription = meter.snapshot$
      .pipe(
        switchMap((snapshot): Observable<JarvisGateState> => {
          function judge(): JarvisGateState {
            return {
              level: computeGateLevel(snapshot, config, now()),
              resetsAtMs: snapshot.windowEndMs,
            };
          }

          const immediate = judge();
          const liftDelayMs = snapshot.windowEndMs - now();
          const lift$ =
            immediate.level !== "none" && liftDelayMs > 0
              ? timer(liftDelayMs).pipe(map(judge))
              : EMPTY;

          return concat(of(immediate), lift$);
        }),
      )
      .subscribe((state) => {
        const previous = this.stateSubject.getValue();

        if (previous.level !== state.level) {
          this.stateSubject.next(state);
        }
      });
  }

  get state$(): Observable<JarvisGateState> {
    return this.stateSubject.asObservable();
  }

  current(): JarvisGateState {
    return this.stateSubject.getValue();
  }

  dispose(): void {
    this.subscription.unsubscribe();
    this.stateSubject.complete();
  }
}
