import type { AmbientStyle } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The ambient-style preference: the replay-current style stream and the write
 * operation, keeping persistence out of the UI. Orthogonal to
 * `AnimatedBackgroundPresenter` (the motion gate).
 */
export interface AmbientStylePresenter {
  readonly style$: Stream<AmbientStyle>;
  setStyle(style: AmbientStyle): void;
}
