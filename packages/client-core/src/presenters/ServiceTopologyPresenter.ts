import type { Observable } from "rxjs";

import type { ServiceHealthPort, ServiceTopology } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/**
 * Thin warmReplay wrapper around ServiceHealthPort.topology$().
 * One active subscription shared across all UI consumers, kept warm across the
 * Admin tab's key={activeTab} remount so the graph isn't re-subscribed.
 */
export class ServiceTopologyPresenter {
  readonly topology$: Observable<ServiceTopology>;

  constructor(port: ServiceHealthPort) {
    this.topology$ = port.topology$().pipe(warmReplay());
  }
}
