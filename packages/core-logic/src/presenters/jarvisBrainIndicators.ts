import type { JarvisState } from "@rtc/core-api";
import {
  JARVIS_BRAIN_NAMES,
  type JarvisBrain,
  type JarvisBudgetView,
  jarvisBrainLabel,
  jarvisBrainName,
} from "@rtc/domain";

import { formatGateResetTimeUtc } from "./jarvisController.js";

/** The slice of `JarvisState` the indicator copy reads. */
export type BrainIndicatorState = Pick<
  JarvisState,
  "available" | "effectiveBrain" | "budget" | "demo"
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

function describeExhausted(budget: JarvisBudgetView): BrainReadout | null {
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
        text: `Scripted · today's AI budget used${backAt(budget.resetsAtMs)}`,
        tone: "warning",
        meterFraction: null,
      };
  }
}

function describeLiveBudget(
  name: string,
  budget: JarvisBudgetView | null,
): BrainReadout {
  if (budget === null) {
    return { text: `${name} · house key`, tone: "normal", meterFraction: null };
  }

  const head = `${name} · ${budget.keyKind === "own" ? "your key" : "house key"}`;

  if (budget.limitUsd === null) {
    return {
      text: `${head} · no personal limit`,
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

  const exhausted =
    state.budget === null ? null : describeExhausted(state.budget);

  if (exhausted !== null) {
    return exhausted;
  }

  if (state.effectiveBrain === "scripted") {
    return { text: "Scripted", tone: "normal", meterFraction: null };
  }

  return describeLiveBudget(
    jarvisBrainName(state.effectiveBrain),
    state.budget,
  );
}

/** The input-bar pill text (the caret is the component's own glyph):
 * `Haiku 4.5 · $0.14`, `Haiku 4.5` with no live amount, `Scripted`. */
export function describeBrainPill(state: BrainIndicatorState): string {
  if (state.effectiveBrain === "scripted") {
    return JARVIS_BRAIN_NAMES.scripted;
  }

  const label = jarvisBrainLabel(state.effectiveBrain);
  const budget = state.budget;

  if (budget === null || budget.limitUsd === null) {
    return label;
  }

  return `${label} · ${formatUsd(leftToday(budget.limitUsd, budget.spentUsd))}`;
}
