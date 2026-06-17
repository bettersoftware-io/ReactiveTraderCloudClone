import type { Observable } from "rxjs";
import type { Theme, ViewMode } from "../preferences/preferences.js";

/**
 * Persists user display preferences. The `*$` streams are replay-current
 * (BehaviorSubject-backed): a subscriber receives the current value
 * synchronously on subscribe. This synchronous initial emission is the
 * contract that prevents a theme flash on load.
 */
export interface PreferencesPort {
  /** Replay-current theme stream; emits the current value synchronously on subscribe. */
  theme$(): Observable<Theme>;
  setTheme(theme: Theme): void;
  /** Replay-current view-mode stream; emits the current value synchronously on subscribe. */
  viewMode$(): Observable<ViewMode>;
  setViewMode(viewMode: ViewMode): void;
}
