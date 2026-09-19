import type { Observable } from "rxjs";

import type { ServiceTopologyPresenter as ServiceTopologyPresenterApi } from "@rtc/core-api";
import type { ServiceHealthPort, ServiceTopology } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Implements `ServiceTopologyPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. A thin `warmReplay` wrapper around
 * `ServiceHealthPort.topology$()`, kept warm across the Admin tab's
 * `key={activeTab}` remount so the graph isn't re-subscribed. */
export class ServiceTopologyPresenter implements ServiceTopologyPresenterApi {
  readonly topology$: Observable<ServiceTopology>;

  constructor(port: ServiceHealthPort) {
    this.topology$ = port.topology$().pipe(warmReplay());
  }
}
