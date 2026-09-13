import type { ServiceTopology } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The service-health topology graph — one shared subscription, kept warm. */
export interface ServiceTopologyPresenter {
  readonly topology$: Stream<ServiceTopology>;
}
