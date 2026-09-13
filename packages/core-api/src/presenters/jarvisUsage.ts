import type { AdminJarvisUsagePayload } from "@rtc/shared";

import type { Stream } from "#/stream";

/**
 * Per-brain turn/token/cost telemetry (Admin surface), for the current rolling
 * window and since server boot, plus the optional budget-gate envelope fields.
 *
 * Null-start: `usage$` emits `null` immediately, before the port's first real
 * snapshot arrives, so consumers can render an explicit loading/empty state
 * instead of stale-looking zeros.
 */
export interface JarvisUsagePresenter {
  readonly usage$: Stream<AdminJarvisUsagePayload | null>;
}
