import type { ThemeMode, ThemeModePreference } from "@rtc/domain";

import type { Stream } from "#/stream";

export interface ThemePreferencePresenter {
  /** The stored mode choice; "system" is left un-resolved here. */
  readonly modePreference$: Stream<ThemeModePreference>;
  /** The concrete mode to paint — "system" resolved against the OS scheme. */
  readonly mode$: Stream<ThemeMode>;
  setMode(mode: ThemeModePreference): void;
  /** Advance the stored preference one step (dark → light → system → dark). */
  cycle(): void;
}
