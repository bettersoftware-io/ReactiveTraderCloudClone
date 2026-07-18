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
 * to the next entry in the fixed order (core → laser → docking → hologram →
 * geo → layers → jarvis → topo → core …). Mirrors `localStorage['rt_bootSeq']`
 * from the prototype; the last five are the v3 3D scenes. */
export type BootVariant =
  | "core"
  | "laser"
  | "docking"
  | "hologram"
  | "geo"
  | "layers"
  | "jarvis"
  | "topo";

/** The equities Watchlist's sort mode — symbol (A–Z), % change, or last price.
 * Driven by the watchlist head's ⇅ cycle control. */
export type EqWatchlistSort = "sym" | "chg" | "price";

/** The equities Blotter panel's active tab — Orders or Positions. */
export type EqBlotterView = "orders" | "positions";

/** The ambient backdrop style. `aurora` is the v5 default — fixed-palette
 * northern-lights curtains; `rays` is the original accent-tinted blobs +
 * rotating conic sweep. Orthogonal to `animatedBackground` (the motion gate)
 * and to the per-skin `--aurora-opacity` master opacity, which gates whichever
 * style is active. */
export type AmbientStyle = "aurora" | "rays";

/** Boot-variant cycle order (PROTO _startBoot `variants` list, v3). */
export const BOOT_VARIANTS: readonly BootVariant[] = [
  "core",
  "laser",
  "docking",
  "hologram",
  "geo",
  "layers",
  "jarvis",
  "topo",
];

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_THEME_SKIN: ThemeSkin = "holo"; // showcase default; "classic" preserves the pre-redesign look
export const DEFAULT_VIEW_MODE: ViewMode = "chart";
/** Ambient animated-background perf gate default. ON: the backdrop is entirely
 * compositor-only CSS (transform/opacity, blur removed — see
 * client-react/src/ui/shell/background/README.md), so the drift is effectively
 * free on the main thread and ships enabled. Users who turn it off keep that
 * choice (persisted under `rtc-animated-bg`); OS `prefers-reduced-motion` still
 * overrides it to static regardless. */
export const DEFAULT_ANIMATED_BACKGROUND = true;
/** Ambient backdrop style default. Matches the v5 design (northern-lights
 * curtains). Users who pick "rays" keep that choice (persisted under
 * `rtc-ambient-style`). */
export const DEFAULT_AMBIENT_STYLE: AmbientStyle = "aurora";
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

/** The Preferences "Ambient style" segmented control renders these in order. */
export const AMBIENT_STYLES: readonly AmbientStyle[] = ["aurora", "rays"];

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
