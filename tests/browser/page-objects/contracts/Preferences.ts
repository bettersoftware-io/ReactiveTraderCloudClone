/**
 * The two chart-rendering substrates the Chart renderer segment row toggles
 * (PreferencesModal.tsx) — kept as a local literal union like this
 * directory's other POs' own unions (e.g. `EquitiesDrawTool` in
 * EquitiesChart.ts) rather than importing `@rtc/domain`'s `ChartSubstrate`.
 */
export type PrefsChartSubstrate = "dom" | "canvas";

/**
 * The Preferences catalogue modal (PreferencesModal.tsx), reached via the
 * account menu's ⚙ Preferences row (AccountMenu.tsx) — the repo's FIRST e2e
 * page-object surface driving this modal. Only the one row the
 * canvas-substrate journey needs (Chart renderer / `useChartSubstrate`); the
 * modal's fuller catalogue (Display/Motion/Trading/Notifications/Data/Jarvis
 * rows, etc.) is exercised by unit + contract tests instead.
 */
export interface PreferencesPO {
  /** Opens the account menu, then clicks its ⚙ Preferences row — the modal
   * mounts once `open` flips true (HeaderChrome.tsx owns the state). */
  open(): Promise<void>;
  waitModalVisible(timeoutMs: number): Promise<void>;
  /** Clicks the Chart renderer segment row's DOM/Canvas option
   * (PrefSegment.tsx composes `pref-segment-chartSubstrate-<value>`). */
  selectChartSubstrate(value: PrefsChartSubstrate): Promise<void>;
  /** Dismisses the modal via its footer DONE button. */
  close(): Promise<void>;
  waitModalHidden(timeoutMs: number): Promise<void>;
}
