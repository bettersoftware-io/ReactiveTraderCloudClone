/**
 * Jarvis token usage, as the ops usage card shows it. It also travels
 * unchanged as the `SERVER_MSG.OPS_JARVIS_USAGE` payload, sent in reply to
 * `CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE`.
 *
 * Per-brain usage totals over two windows: `currentWindow` (today, the UTC
 * day) and `sinceBoot` (cumulative since server start).
 */

import type { JarvisHouseBrain } from "../preferences/preferences.js";
import type { JarvisGateLevel } from "./jarvisEvent.js";

/** One brain's totals over one window. */
export interface JarvisBrainUsageRow {
  readonly brain: JarvisHouseBrain;
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Display-only estimate from the server price table; 0 for scripted. */
  readonly estimatedCostUsd: number;
}

/** The usage meter alone: today's totals (the UTC day) and the totals since
 * boot, with no budget attached. */
export interface JarvisUsageSnapshot {
  readonly windowStartMs: number; // epoch ms; 0 = no turn recorded yet
  readonly windowEndMs: number;
  readonly currentWindow: readonly JarvisBrainUsageRow[];
  readonly sinceBoot: readonly JarvisBrainUsageRow[];
}

/** Jarvis usage as the ops card shows it: the meter snapshot plus the
 * budget-gate envelope. It travels unchanged as the
 * `SERVER_MSG.OPS_JARVIS_USAGE` payload (named `OpsJarvisUsagePayload`
 * until 2026-10-05). All four gate fields are absent on pre-round servers.
 * Since B3a `budgetUsd` is the house-wide daily cap, `spentWindowUsd` the
 * house-wide spend today and `gateLevel` `"hard"` once that spend reaches the
 * cap; `softBudgetUsd` is always null (the soft stage is retired) and the
 * `null` budget and `"soft"` level remain only for older servers. */
export interface JarvisUsage extends JarvisUsageSnapshot {
  readonly budgetUsd?: number | null;
  readonly softBudgetUsd?: number | null;
  readonly spentWindowUsd?: number;
  readonly gateLevel?: JarvisGateLevel;
}
