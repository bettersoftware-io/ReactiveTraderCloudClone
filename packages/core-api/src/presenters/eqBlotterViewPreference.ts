import type { EqBlotterView } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The equities blotter tab preference (Orders / Positions): the replay-current
 * view stream and the write operation, keeping persistence out of the UI.
 */
export interface EqBlotterViewPreferencePresenter {
  readonly view$: Stream<EqBlotterView>;
  setView(view: EqBlotterView): void;
}
