import { type Observable, startWith } from "rxjs";

import type { JarvisUsageSnapshot } from "@rtc/shared";

import type { JarvisUsagePort } from "#/adapters/jarvisUsagePort";

import { warmReplay } from "./warmReplay.js";

/**
 * Thin warmReplay wrapper around `JarvisUsagePort.usage$()` (Admin surface):
 * per-brain turn/token/cost telemetry, for the current rolling window and
 * since server boot.
 *
 * Null-start: `usage$` emits `null` immediately, before the port's first
 * real snapshot arrives (WS-real mode's first `ADMIN_JARVIS_USAGE` push can
 * lag behind mount), so consumers can render an explicit loading/empty
 * state instead of stale-looking zeros. One shared subscription kept warm
 * for the whole session (see `warmReplay`'s doc), so the Admin tab's
 * `key={activeTab}` remount doesn't re-send the wire subscribe.
 */
export class JarvisUsagePresenter {
  readonly usage$: Observable<JarvisUsageSnapshot | null>;

  constructor(port: JarvisUsagePort) {
    this.usage$ = port.usage$().pipe(startWith(null), warmReplay());
  }
}
