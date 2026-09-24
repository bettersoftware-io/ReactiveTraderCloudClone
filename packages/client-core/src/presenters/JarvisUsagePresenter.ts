import { defer, type Observable, startWith } from "rxjs";

import type { JarvisUsagePresenter as JarvisUsagePresenterApi } from "@rtc/core-api";
import type { AdminJarvisUsagePayload } from "@rtc/shared";

import type { JarvisUsagePort } from "#/adapters/jarvisUsagePort";

import { warmReplay } from "./warmReplay.js";

/** Implements `JarvisUsagePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. A thin `warmReplay` wrapper around
 * `JarvisUsagePort.usage$()`; the null-start covers WS-real mode's first
 * `ADMIN_JARVIS_USAGE` push lagging behind mount, and the one shared
 * subscription survives the Admin tab's `key={activeTab}` remount without
 * re-sending the wire subscribe. The port is reached only on the first
 * subscription (`defer`), so an app whose usage presenter nobody reads — the
 * base app under `CoreSeams.nativeJarvis` — never touches it. */
export class JarvisUsagePresenter implements JarvisUsagePresenterApi {
  readonly usage$: Observable<AdminJarvisUsagePayload | null>;

  constructor(port: JarvisUsagePort) {
    this.usage$ = defer(() => {
      return port.usage$();
    }).pipe(startWith(null), warmReplay());
  }
}
