import type { ConnectionStatus } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Connection status fold over the connection-events port; replay-current. */
export interface ConnectionStatusPresenter {
  readonly status$: Stream<ConnectionStatus>;
}
