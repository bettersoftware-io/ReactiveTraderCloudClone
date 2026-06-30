import { type Observable, shareReplay } from "rxjs";

import type { ServiceHealthPort, ServiceTopology } from "@rtc/domain";

/**
 * Thin shareReplay wrapper around ServiceHealthPort.topology$().
 * One active subscription shared across all UI consumers.
 */
export class ServiceTopologyPresenter {
  readonly topology$: Observable<ServiceTopology>;

  constructor(port: ServiceHealthPort) {
    this.topology$ = port
      .topology$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
