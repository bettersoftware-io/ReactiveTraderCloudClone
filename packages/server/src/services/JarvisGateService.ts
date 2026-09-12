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

import type { JarvisGateLevel } from "@rtc/shared";

import { computeGateLevel, type JarvisGateConfig } from "./jarvisGate.js";
import type { UsageMeter } from "./UsageMeter.js";

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
          function judge(nowMs: number): JarvisGateState {
            return {
              level: computeGateLevel(snapshot, config, nowMs),
              resetsAtMs: snapshot.windowEndMs,
            };
          }

          // Single reading shared by the immediate judgment and the lift
          // delay below — reading now() twice risked the two calls
          // straddling windowEndMs (one still before, one already past),
          // which would judge "hard" immediately yet compute a negative
          // liftDelayMs and arm no lift timer at all.
          const at = now();
          const immediate = judge(at);
          const liftDelayMs = snapshot.windowEndMs - at;
          const lift$ =
            immediate.level !== "none" && liftDelayMs > 0
              ? // The lift itself re-reads now() when the timer actually
                // fires — it must NOT reuse `at`, or the re-judgment would
                // be evaluated at the snapshot's arrival time instead of
                // the real time the lift fires.
                timer(liftDelayMs).pipe(
                  map(() => {
                    return judge(now());
                  }),
                )
              : EMPTY;

          return concat(of(immediate), lift$);
        }),
      )
      .subscribe((state) => {
        const previous = this.stateSubject.getValue();

        if (
          previous.level !== state.level ||
          (state.level !== "none" && previous.resetsAtMs !== state.resetsAtMs)
        ) {
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
