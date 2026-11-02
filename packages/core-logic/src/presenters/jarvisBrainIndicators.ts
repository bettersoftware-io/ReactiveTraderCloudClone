import type { JarvisState } from "@rtc/core-api";
import {
  isJarvisOwnBrain,
  JARVIS_BRAIN_NAMES,
  JARVIS_PROVIDER_NAMES,
  type JarvisBrain,
  type JarvisBudgetView,
  jarvisBrainLabel,
  jarvisBrainName,
} from "@rtc/domain";

import { formatGateResetTimeUtc } from "./jarvisController.js";

/** The slice of `JarvisState` the indicator copy reads. */
export type BrainIndicatorState = Pick<
  JarvisState,
  | "available"
  | "effectiveBrain"
  | "preferredBrain"
  | "budget"
  | "ownBudget"
  | "ownKey"
  | "demo"
>;

/** The header readout: one line of copy, its tone, and a meter fill in
 * `[0, 1]` (`null` = no meter). */
export interface BrainReadout {
  readonly text: string;
  readonly tone: "normal" | "warning";
  readonly meterFraction: number | null;
}

/** Dollars with two decimals, clamped at zero — the budget may overshoot its
 * limit by one request (spec §3.4) and must never read as a negative amount. */
export function formatUsd(amount: number): string {
  return `$${Math.max(0, amount).toFixed(2)}`;
}

/** The name of the brain the server ran, for a reply's tag. */
export function describeReplyTag(brain: JarvisBrain): string {
  return jarvisBrainName(brain);
}

function leftToday(limitUsd: number, spentUsd: number): number {
  return Math.max(0, limitUsd - spentUsd);
}

function backAt(resetsAtMs: number): string {
  // `0` is the forced-gate "no known reset" sentinel: no dangling "back at —".
  return resetsAtMs === 0
    ? ""
    : ` · back at ${formatGateResetTimeUtc(resetsAtMs)}`;
}

function describeExhausted(
  budget: JarvisBudgetView,
  own: boolean,
): BrainReadout | null {
  switch (budget.exhausted) {
    case null:
      return null;
    case "unavailable":
      return {
        text: "Scripted · AI budget unavailable",
        tone: "warning",
        meterFraction: null,
      };
    case "house":
      return {
        text: `Scripted · house AI budget used${backAt(budget.resetsAtMs)}`,
        tone: "warning",
        meterFraction: null,
      };
    case "user":
    case "forced":
      return {
        text: `Scripted · ${own ? "your daily limit" : "today's AI budget"} used${backAt(budget.resetsAtMs)}`,
        tone: "warning",
        meterFraction: null,
      };
  }
}

function describeLiveBudget(
  name: string,
  budget: JarvisBudgetView | null,
  noLimitCopy: string,
): BrainReadout {
  if (budget === null) {
    return { text: `${name} · house key`, tone: "normal", meterFraction: null };
  }

  const head = `${name} · ${budget.keyKind === "own" ? "your key" : "house key"}`;

  if (budget.limitUsd === null) {
    return {
      text: `${head} · ${noLimitCopy}`,
      tone: "normal",
      meterFraction: null,
    };
  }

  const left = leftToday(budget.limitUsd, budget.spentUsd);
  return {
    text: `${head} · ${formatUsd(left)} of ${formatUsd(budget.limitUsd)} left today`,
    tone: "normal",
    // A non-positive limit has no meter (and 0 / 0 would be NaN). The
    // server reads a 0 limit as already spent, but this copy does not
    // lean on that.
    meterFraction: budget.limitUsd > 0 ? left / budget.limitUsd : null,
  };
}

/** The readout while an own brain is the effective one. The house budget is
 * deliberately not read: a spent house budget does not stop a person's own key. */
function describeOwnBrain(state: BrainIndicatorState): BrainReadout {
  const { ownKey, ownBudget } = state;

  if (ownKey?.status === "refused") {
    return {
      text: `${JARVIS_PROVIDER_NAMES[ownKey.provider]} refused your key`,
      tone: "warning",
      meterFraction: null,
    };
  }

  const exhausted =
    ownBudget === null ? null : describeExhausted(ownBudget, true);

  if (exhausted !== null) {
    return exhausted;
  }

  const label = jarvisBrainLabel(state.effectiveBrain);

  if (ownBudget === null) {
    return {
      text: `${label} · your key`,
      tone: "normal",
      meterFraction: null,
    };
  }

  return describeLiveBudget(label, ownBudget, "no limit");
}

function warning(text: string): BrainReadout {
  return { text, tone: "warning", meterFraction: null };
}

/** The readout for a person who prefers an own brain but is running scripted:
 * a spent cap, a key that is not set, or one that could not be checked. `null`
 * when none of those explains it. */
function describeOwnPreferenceUnmet(
  state: BrainIndicatorState,
): BrainReadout | null {
  const { ownKey, ownBudget } = state;
  const exhausted =
    ownBudget === null ? null : describeExhausted(ownBudget, true);

  if (exhausted !== null) {
    return exhausted;
  }

  if (ownKey === null) {
    return warning("Scripted · your key isn't set");
  }

  if (ownKey.status === "unreachable") {
    return warning(
      `Scripted · couldn't reach ${JARVIS_PROVIDER_NAMES[ownKey.provider]}`,
    );
  }

  return ownKey.status === "limited"
    ? warning("Scripted · too many key checks")
    : null;
}

/** The header readout, or `null` when Jarvis is unavailable. */
export function describeBrainReadout(
  state: BrainIndicatorState,
): BrainReadout | null {
  if (!state.available) {
    return null;
  }

  if (state.demo) {
    return { text: "Scripted · demo", tone: "normal", meterFraction: null };
  }

  if (isJarvisOwnBrain(state.effectiveBrain)) {
    return describeOwnBrain(state);
  }

  if (
    state.effectiveBrain === "scripted" &&
    isJarvisOwnBrain(state.preferredBrain)
  ) {
    const unmet = describeOwnPreferenceUnmet(state);

    if (unmet !== null) {
      return unmet;
    }
  }

  const exhausted =
    state.budget === null ? null : describeExhausted(state.budget, false);

  if (exhausted !== null) {
    return exhausted;
  }

  if (state.effectiveBrain === "scripted") {
    // A spent own cap is not mentioned here: a person whose preference is an
    // own brain was answered above (`describeOwnPreferenceUnmet`), and anyone
    // else chose Scripted or runs on the house, so the cap moved nobody.
    return { text: "Scripted", tone: "normal", meterFraction: null };
  }

  return describeLiveBudget(
    jarvisBrainName(state.effectiveBrain),
    state.budget,
    "no personal limit",
  );
}

/** The input-bar pill text (the caret is the component's own glyph):
 * `Haiku 4.5 · $0.14`, `Haiku 4.5` with no live amount, `Scripted`. */
export function describeBrainPill(state: BrainIndicatorState): string {
  if (state.effectiveBrain === "scripted") {
    return JARVIS_BRAIN_NAMES.scripted;
  }

  const label = jarvisBrainLabel(state.effectiveBrain);
  const budget = isJarvisOwnBrain(state.effectiveBrain)
    ? state.ownBudget
    : state.budget;

  if (budget === null || budget.limitUsd === null) {
    return label;
  }

  return `${label} · ${formatUsd(leftToday(budget.limitUsd, budget.spentUsd))}`;
}
