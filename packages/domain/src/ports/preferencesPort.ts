import type { Observable } from "rxjs";

import type {
  ThemeMode,
  ThemeSkin,
  ViewMode,
} from "../preferences/preferences.js";

/**
 * Persists user display preferences. The `*$` streams are replay-current
 * (BehaviorSubject-backed): a subscriber receives the current value
 * synchronously on subscribe. This synchronous initial emission is the
 * contract that prevents a theme flash on load.
 *
 * Theming spans two orthogonal axes — `themeMode` (light/dark) and `themeSkin`
 * (visual identity). `animatedBackground` is the perf gate for ambient motion
 * (off by default).
 */
export interface PreferencesPort {
  /** Replay-current theme-mode stream; emits synchronously on subscribe. */
  themeMode$(): Observable<ThemeMode>;
  setThemeMode(mode: ThemeMode): void;
  /** Replay-current theme-skin stream; emits synchronously on subscribe. */
  themeSkin$(): Observable<ThemeSkin>;
  setThemeSkin(skin: ThemeSkin): void;
  /** Replay-current view-mode stream; emits synchronously on subscribe. */
  viewMode$(): Observable<ViewMode>;
  setViewMode(viewMode: ViewMode): void;
  /** Ambient-motion perf gate; default false. */
  animatedBackground$(): Observable<boolean>;
  setAnimatedBackground(on: boolean): void;
}
