/**
 * Jarvis token usage, as the admin usage card shows it. It also travels
 * unchanged as the `SERVER_MSG.ADMIN_JARVIS_USAGE` payload, sent in reply to
 * `CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE`.
 *
 * Per-brain usage totals over two windows: `currentWindow` (the live
 * rate-limit window) and `sinceBoot` (cumulative since server start).
 */

import type { JarvisBrain } from "../preferences/preferences.js";
import type { JarvisGateLevel } from "./jarvisEvent.js";

/** One brain's totals over one window. */
export interface JarvisBrainUsageRow {
  readonly brain: JarvisBrain;
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Display-only estimate from the server price table; 0 for scripted. */
  readonly estimatedCostUsd: number;
}

/** The usage meter alone: the live rate-limit window and the totals since
 * boot, with no budget attached. */
export interface JarvisUsageSnapshot {
  readonly windowStartMs: number; // epoch ms; 0 = no turn recorded yet
  readonly windowEndMs: number;
  readonly currentWindow: readonly JarvisBrainUsageRow[];
  readonly sinceBoot: readonly JarvisBrainUsageRow[];
}

/** Jarvis usage as the admin card shows it: the meter snapshot plus the
 * budget-gate envelope. It travels unchanged as the
 * `SERVER_MSG.ADMIN_JARVIS_USAGE` payload (named `AdminJarvisUsagePayload`
 * until 2026-10-05). All four gate fields are absent on pre-round servers.
 * `budgetUsd: null` means gating is disabled (`RTC_JARVIS_BUDGET_USD=off`);
 * `softBudgetUsd` is server-computed (budget × soft ratio) so the client
 * never needs the ratio itself. */
export interface JarvisUsage extends JarvisUsageSnapshot {
  readonly budgetUsd?: number | null;
  readonly softBudgetUsd?: number | null;
  readonly spentWindowUsd?: number;
  readonly gateLevel?: JarvisGateLevel;
}
