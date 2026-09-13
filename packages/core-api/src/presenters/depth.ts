import type { DepthBook } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-symbol depth books; a repeat call for a symbol returns the same stream. */
export interface DepthPresenter {
  depth$(symbol: string): Stream<DepthBook>;
}
