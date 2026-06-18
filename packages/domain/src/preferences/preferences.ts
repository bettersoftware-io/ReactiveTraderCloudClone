/**
 * User-facing display preferences. These are pure value types — the UI's
 * `Theme` (shell/theme/ThemeProvider) and `ViewMode` (fx/liveRates/ViewToggle)
 * unions mirror these exactly. Defaults match today's synchronous-read defaults
 * so the localStorage adapter is transparent to existing users.
 */

export type Theme = "dark" | "light";
export type ViewMode = "chart" | "price";

export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_VIEW_MODE: ViewMode = "chart";
