import type { ViewMode } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The live-rates view-mode preference: the replay-current view-mode stream and
 * the write operation, keeping persistence out of the UI.
 */
export interface ViewModePreferencePresenter {
  readonly viewMode$: Stream<ViewMode>;
  setViewMode(viewMode: ViewMode): void;
}
