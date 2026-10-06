/**
 * The two chart-rendering substrates the Chart renderer segment row toggles
 * (PreferencesModal.tsx) — kept as a local literal union like this
 * directory's other POs' own unions (e.g. `EquitiesDrawTool` in
 * EquitiesChart.ts) rather than importing `@rtc/domain`'s `ChartSubstrate`.
 */
export type PrefsChartSubstrate = "dom" | "canvas";

/**
 * The two layout engines the Layout engine segment row toggles
 * (PreferencesModal.tsx's `LAYOUT_ENGINE_OPTIONS` / `useLayoutEngine`) — the
 * same values the engine root's own `data-engine` witness renders, so
 * `LayoutPO` reuses this type rather than declaring its own duplicate union.
 */
export type PrefsLayoutEngine = "inhouse" | "dockview";

/**
 * The three application cores the Application core segment row toggles
 * (PreferencesContent.tsx's `coreSelection.options` / `switchCore`) — mirrors
 * `CoreImpl` from `@rtc/core-api` as a local literal union, like this
 * directory's other POs' own unions above.
 */
export type PrefsCoreImpl = "rxjs" | "async" | "effect";

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
  /** Resolves once keyboard focus is on the modal or inside it; rejects
   * after `timeoutMs`. */
  waitModalHoldsFocus(timeoutMs: number): Promise<void>;
  /** Clicks the Chart renderer segment row's DOM/Canvas option
   * (PrefSegment.tsx composes `pref-segment-chartSubstrate-<value>`). */
  selectChartSubstrate(value: PrefsChartSubstrate): Promise<void>;
  /** Clicks the Layout engine segment row's In-house/Dockview option
   * (PrefSegment.tsx composes `pref-segment-layoutEngine-<value>`). */
  selectLayoutEngine(value: PrefsLayoutEngine): Promise<void>;
  /** Clicks the Application core segment row's RxJS/async/Effect option
   * (PrefSegment.tsx composes `pref-segment-coreImpl-<value>`). Choosing a
   * core other than the current one swaps it in place, with no navigation
   * (`coreHost.ts`), and the modal opens again on the new core. */
  selectCoreImpl(value: PrefsCoreImpl): Promise<void>;
  /** Waits until the Application core row's selected option (its
   *  `aria-pressed` segment) is `value`. */
  waitCoreImplSelected(value: PrefsCoreImpl, timeoutMs: number): Promise<void>;
  /** Dismisses the modal via its footer DONE button. */
  close(): Promise<void>;
  waitModalHidden(timeoutMs: number): Promise<void>;
}
