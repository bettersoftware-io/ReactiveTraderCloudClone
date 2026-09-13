import type { LayoutEngine } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The layout-engine preference: the replay-current engine stream and the write
 * operation, keeping persistence out of the UI.
 */
export interface LayoutEnginePresenter {
  readonly engine$: Stream<LayoutEngine>;
  setEngine(engine: LayoutEngine): void;
}
