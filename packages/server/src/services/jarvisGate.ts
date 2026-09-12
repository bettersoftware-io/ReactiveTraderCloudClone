import { JARVIS_BRAINS, type JarvisBrain } from "@rtc/domain";
import type { JarvisGateLevel, JarvisUsageSnapshot } from "@rtc/shared";

export const DEFAULT_JARVIS_BUDGET_USD = 1;
export const DEFAULT_JARVIS_BUDGET_SOFT_RATIO = 0.8;

/** The expensive brains the soft stage removes — a literal policy list,
 * chosen deliberately rather than derived. */
const SOFT_GATED: readonly JarvisBrain[] = ["claude-sonnet-5", "claude-opus-5"];

/** Hard removes every real (non-scripted) brain — derived from
 * `JARVIS_BRAINS` rather than listed, so a future brain joining the roster
 * is hard-gated by default instead of silently staying offered past budget. */
const HARD_GATED: readonly JarvisBrain[] = JARVIS_BRAINS.filter((brain) => {
  return brain !== "scripted";
});

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
