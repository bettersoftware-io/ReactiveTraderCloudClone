import type { Observable } from "rxjs";

import type { AdminJarvisUsagePayload } from "@rtc/shared";

export type { AdminJarvisUsagePayload, JarvisUsageSnapshot } from "@rtc/shared";

/**
 * App-layer port for the rolling Jarvis usage/cost telemetry (Admin
 * surface): per-brain turn counts, token counts, and estimated spend, both
 * for the current rolling window and since server boot, PLUS the optional
 * budget-gate envelope (`budgetUsd`/`softBudgetUsd`/`spentWindowUsd`/
 * `gateLevel` — all absent on a pre-round server). WS-real mode
 * (`WsJarvisUsageAdapter`) streams `SERVER_MSG.ADMIN_JARVIS_USAGE` pushes;
 * simulator mode returns an always-empty snapshot (no gate fields — there is
 * no live Anthropic spend, and so no budget to report, offline).
 */
export interface JarvisUsagePort {
  usage$(): Observable<AdminJarvisUsagePayload>;
}
