import type { Observable } from "rxjs";

/**
 * App-layer port over the OS colour-scheme signal (`prefers-color-scheme`). Kept
 * an app port — not a domain one — because it reflects a platform/render-target
 * concern (the browser media query), the same reason the layout engine sits
 * behind an app-layer port. `ThemePreferencePresenter` combines this with the
 * stored mode preference to resolve "system" to a concrete `ThemeMode`.
 */
export interface ColorSchemeSource {
  /** Replay-current stream of whether the OS prefers a dark scheme; emits
   * synchronously on subscribe and again whenever the OS setting flips. */
  prefersDark$(): Observable<boolean>;
}
