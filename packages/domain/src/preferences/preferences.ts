/**
 * User-facing display preferences. These are pure value types — the UI's
 * theme tokens (shell/theme) and `ViewMode` (fx/liveRates/ViewToggle) unions
 * mirror these exactly. Defaults match today's synchronous-read defaults so
 * the localStorage adapter is transparent to existing users.
 *
 * Theming has two orthogonal axes: a `ThemeSkin` (visual identity) and a
 * `ThemeMode` (light/dark recolouring).
 */

export type ThemeMode = "dark" | "light";
/**
 * The user's stored theme-mode choice. `"system"` defers the concrete mode to
 * the OS (`prefers-color-scheme`); `resolveThemeMode` collapses it to a paintable
 * `ThemeMode`. The two concrete values coincide with `ThemeMode`, so the painted
 * tokens / `dataset.mode` stay `dark | light` regardless of the preference.
 */
export type ThemeModePreference = ThemeMode | "system";
export type ThemeSkin =
  | "classic"
  | "holo"
  | "holo3d"
  | "terminal"
  | "terminal3d"
  | "neon";
export type ViewMode = "chart" | "price";

/** The Credit RFQs panel's LIVE/CLOSED/ALL filter, shared between the panel
 * (reader) and its head's filter pills (writer) via the same
 * useCreditRfqFilterPreference seam as ViewMode. Mirrors the prototype's
 * CreditTab union (dc.html `creditTab` state). */
export type CreditRfqFilter = "live" | "closed" | "all";

/** The boot sequence visual variant. Cycles across sessions — each run advances
 * to the next entry in the fixed order (core → laser → docking → core …).
 * Mirrors `localStorage['rt_bootSeq']` from the prototype. */
export type BootVariant = "core" | "laser" | "docking";

/** The equities Watchlist's sort mode — symbol (A–Z), % change, or last price.
 * Driven by the watchlist head's ⇅ cycle control. */
export type EqWatchlistSort = "sym" | "chg" | "price";

/** The equities Blotter panel's active tab — Orders or Positions. */
export type EqBlotterView = "orders" | "positions";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_THEME_SKIN: ThemeSkin = "holo"; // showcase default; "classic" preserves the pre-redesign look
export const DEFAULT_VIEW_MODE: ViewMode = "chart";
export const DEFAULT_CREDIT_RFQ_FILTER: CreditRfqFilter = "live";
export const DEFAULT_BOOT_VARIANT: BootVariant = "core";
export const DEFAULT_EQ_WATCHLIST_SORT: EqWatchlistSort = "chg";
export const DEFAULT_EQ_BLOTTER_VIEW: EqBlotterView = "orders";

/** The watchlist head's ⇅ button cycles through these in order. */
export const EQ_WATCHLIST_SORTS: readonly EqWatchlistSort[] = [
  "sym",
  "chg",
  "price",
];

export const THEME_SKINS: readonly ThemeSkin[] = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
];
export const THEME_MODES: readonly ThemeMode[] = ["dark", "light"];

/** Default stored mode preference. Equal in value to DEFAULT_THEME_MODE, so
 * existing users (who have a concrete "dark"/"light" persisted) and the visual
 * goldens are unaffected — "system" is strictly opt-in via the header toggle. */
export const DEFAULT_THEME_MODE_PREFERENCE: ThemeModePreference = "dark";

/** The header toggle cycles through these in order: dark → light → system → … */
export const THEME_MODE_PREFERENCES: readonly ThemeModePreference[] = [
  "dark",
  "light",
  "system",
];

/** The next preference in the toggle cycle (wraps around). */
export function nextThemeModePreference(
  current: ThemeModePreference,
): ThemeModePreference {
  const i = THEME_MODE_PREFERENCES.indexOf(current);
  return (
    THEME_MODE_PREFERENCES[(i + 1) % THEME_MODE_PREFERENCES.length] ?? "dark"
  );
}

/** Collapse a stored preference to the concrete mode that actually paints:
 * "system" follows the OS via `prefersDark`; concrete choices pass through. */
export function resolveThemeMode(
  pref: ThemeModePreference,
  prefersDark: boolean,
): ThemeMode {
  if (pref === "system") {
    return prefersDark ? "dark" : "light";
  }

  return pref;
}

/** The next sort in the watchlist head's ⇅ cycle (wraps around): sym → chg → price → sym. */
export function nextEqWatchlistSort(current: EqWatchlistSort): EqWatchlistSort {
  const i = EQ_WATCHLIST_SORTS.indexOf(current);
  return (
    EQ_WATCHLIST_SORTS[(i + 1) % EQ_WATCHLIST_SORTS.length] ??
    DEFAULT_EQ_WATCHLIST_SORT
  );
}
