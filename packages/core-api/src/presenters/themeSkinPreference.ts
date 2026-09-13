import type { ThemeSkin } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The theme-skin preference: the replay-current skin stream and the write
 * operation, keeping persistence out of the UI.
 */
export interface ThemeSkinPreferencePresenter {
  readonly skin$: Stream<ThemeSkin>;
  setSkin(skin: ThemeSkin): void;
}
