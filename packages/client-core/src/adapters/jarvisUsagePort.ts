import type { Observable } from "rxjs";

import type { JarvisUsageSnapshot } from "@rtc/shared";

export type { JarvisUsageSnapshot } from "@rtc/shared";

/**
 * App-layer port for the rolling Jarvis usage/cost telemetry (Admin
 * surface): per-brain turn counts, token counts, and estimated spend, both
 * for the current rolling window and since server boot. WS-real mode
 * (`WsJarvisUsageAdapter`) streams `SERVER_MSG.ADMIN_JARVIS_USAGE` pushes;
 * simulator mode returns an always-empty snapshot — there is no live
 * Anthropic spend to report offline.
 */
export interface JarvisUsagePort {
  usage$(): Observable<JarvisUsageSnapshot>;
}
