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
export type ThemeSkin = "classic" | "holo" | "terminal" | "neon";
export type ViewMode = "chart" | "price";

/** The boot sequence visual variant. Cycles across sessions — each run advances
 * to the next entry in the fixed order (core → laser → docking → core …).
 * Mirrors `localStorage['rt_bootSeq']` from the prototype. */
export type BootVariant = "core" | "laser" | "docking";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_THEME_SKIN: ThemeSkin = "holo"; // showcase default; "classic" preserves the pre-redesign look
export const DEFAULT_VIEW_MODE: ViewMode = "chart";
export const DEFAULT_BOOT_VARIANT: BootVariant = "core";

export const THEME_SKINS: readonly ThemeSkin[] = [
  "classic",
  "holo",
  "terminal",
  "neon",
];
export const THEME_MODES: readonly ThemeMode[] = ["dark", "light"];
