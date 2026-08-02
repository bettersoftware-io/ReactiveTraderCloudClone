import type { JarvisBrain } from "@rtc/domain";

/**
 * Jarvis token-usage wire vocabulary — `SERVER_MSG.ADMIN_JARVIS_USAGE`
 * payload, sent in reply to `CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE`.
 *
 * Per-brain usage totals over two windows: `currentWindow` (the live
 * rate-limit window) and `sinceBoot` (cumulative since server start).
 */
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

/** `SERVER_MSG.ADMIN_JARVIS_USAGE` payload. */
export interface JarvisUsageSnapshot {
  readonly windowStartMs: number; // epoch ms; 0 = no turn recorded yet
  readonly windowEndMs: number;
  readonly currentWindow: readonly JarvisBrainUsageRow[];
  readonly sinceBoot: readonly JarvisBrainUsageRow[];
}
