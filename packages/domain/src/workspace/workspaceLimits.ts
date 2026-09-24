/** The workspace's caps and cadences. The suites in `@rtc/core-contract`
 * assert them, and that package may not import `@rtc/client-core` — hence
 * here (pluggable-core slice 7, the `bootCadence` precedent). */

/** Open `eq-chart:<symbol>` panel instances per tab. */
export const MAX_PANEL_INSTANCES: number = 4;

/** FLOATING Jarvis desk panels; docked ones do not count against it. */
export const MAX_LIVE_PANELS: number = 4;

/** Jarvis desk panels docked into the workspace, across every tab. */
export const MAX_DOCKED_PANELS: number = 4;

/** Saved layout presets per tab. */
export const MAX_LAYOUT_PRESETS: number = 10;

/** The debounce between a workspace change and its persisted write. */
export const WORKSPACE_PERSIST_DEBOUNCE_MS: number = 500;

/** The pause between consecutive commands of one Jarvis drive batch. */
export const DRIVE_STAGGER_MS: number = 350;
