import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type {
  AmbientStyle,
  ChartSubstrate,
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  LoginWaitDelay,
  LoginWaitStyle,
} from "@rtc/domain";

export interface PreferencesModalProps {
  open: boolean;
  onClose: () => void;
}

const POWER_SAVER_LEVELS = ["off", "calm", "freeze"] as const;

/**
 * Page object for PreferencesModal. SIX rows are REAL controls: the
 * Animated-background toggle (wired to useAnimatedBackground), the Power
 * saver segment (wired to usePowerSaver, 3-state Off/Calm/Freeze), the
 * Ambient style segment (wired to useAmbientStyle), and the
 * Always-play-boot-animation toggle (wired to useForceBootAnimation), and the
 * two login-wait rows (wired to useLoginWaitPreferences). The
 * animated-background, power-saver, and force-boot seams record their written
 * values, asserted via `animatedBgSets()` / `powerSaverLevelSets()` /
 * `forceBootAnimationSets()` — the ambient-style segment is backed by the
 * shared World subject instead (like themeSkin), so it's asserted by reading
 * the reflected value back, exactly like ThemePicker's `documentSkin()` idiom.
 * Cosmetic rows are checked for presence only.
 */
export class PreferencesModalPage extends MountedComponent<PreferencesModalProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** True when the modal overlay is rendered (false → closed / returned null). */
  isOpen(): boolean {
    return within(this.root).queryByTestId("prefs-modal") !== null;
  }

  /** Current state of the real Animated-background switch (its `data-on`). */
  animatedBgOn(): boolean {
    return (
      within(this.root)
        .getByTestId("pref-toggle-animatedBg")
        .getAttribute("data-on") === "true"
    );
  }

  /** Toggle the real Animated-background switch through the seam. */
  async toggleAnimatedBg(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("pref-toggle-animatedBg"),
    );
  }

  /** The values written to the animated-background seam, in order. */
  animatedBgSets(): boolean[] {
    return this.commandLog().animatedBackgroundSets;
  }

  /** The Power saver segment's currently-active level ("off" | "calm" | "freeze"). */
  powerSaverLevel(): string {
    const active = POWER_SAVER_LEVELS.find((value) => {
      return (
        within(this.root)
          .getByTestId(`pref-segment-powerSaver-${value}`)
          .getAttribute("data-on") === "true"
      );
    });
    return active ?? "";
  }

  /** Select a Power saver segment option through the seam. */
  async selectPowerSaverLevel(level: "off" | "calm" | "freeze"): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`pref-segment-powerSaver-${level}`),
    );
  }

  /** The levels written to the power-saver seam, in order. */
  powerSaverLevelSets(): string[] {
    return this.commandLog().powerSaverLevelSets;
  }

  /** Current state of the real Always-play-boot-animation switch (its `data-on`). */
  forceBootAnimationOn(): boolean {
    return (
      within(this.root)
        .getByTestId("pref-toggle-forceBootAnimation")
        .getAttribute("data-on") === "true"
    );
  }

  /** Toggle the real Always-play-boot-animation switch through the seam. */
  async toggleForceBootAnimation(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("pref-toggle-forceBootAnimation"),
    );
  }

  /** The values written to the force-boot-animation seam, in order. */
  forceBootAnimationSets(): boolean[] {
    return this.commandLog().forceBootAnimationSets;
  }

  /** Click the ✕ dismiss control. */
  async close(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("prefs-close"));
  }

  /** Click the DONE control. */
  async done(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("prefs-done"));
  }

  /** True when a section heading with the given label is present. */
  hasSection(label: string): boolean {
    return within(this.root).queryByText(label) !== null;
  }

  /** True when a cosmetic toggle row with the given key is present. */
  hasToggle(key: string): boolean {
    return within(this.root).queryByTestId(`pref-toggle-${key}`) !== null;
  }

  /** Current state of a cosmetic toggle (its `data-on`). */
  cosmeticOn(key: string): boolean {
    return (
      within(this.root)
        .getByTestId(`pref-toggle-${key}`)
        .getAttribute("data-on") === "true"
    );
  }

  /** Click a cosmetic toggle row. */
  async toggleCosmetic(key: string): Promise<void> {
    await this.user.click(within(this.root).getByTestId(`pref-toggle-${key}`));
  }

  /** True when the given segment option is the active one (its `data-on`). */
  segmentActive(group: string, value: string): boolean {
    return (
      within(this.root)
        .getByTestId(`pref-segment-${group}-${value}`)
        .getAttribute("data-on") === "true"
    );
  }

  /** Click a segment option. */
  async selectSegment(group: string, value: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`pref-segment-${group}-${value}`),
    );
  }

  /** Section headings per column, in document order — `[0]` is the left
   * column. Lets a spec pin WHICH column a section lives in, which is what
   * keeps the two-column split meaningful rather than incidental. */
  sectionsInColumn(index: number): string[] {
    return [...this.columnAt(index).querySelectorAll("*")]
      .filter((el) => {
        return SECTION_LABELS.has(el.textContent?.trim() ?? "");
      })
      .map((el) => {
        return el.textContent?.trim() ?? "";
      });
  }

  /** Number of preference ROWS in a column — toggles plus distinct segment
   * groups. Segments carry a testid per OPTION rather than per row
   * (`pref-segment-density-compact`), so the group prefix is what gets
   * counted; otherwise a 4-option row would weigh four times a toggle. */
  rowCountInColumn(index: number): number {
    const column = this.columnAt(index);
    const toggles = column.querySelectorAll('[data-testid^="pref-toggle-"]');
    const segmentGroups = new Set(
      [...column.querySelectorAll('[data-testid^="pref-segment-"]')].map(
        (el) => {
          const testid = el.getAttribute("data-testid") ?? "";
          // "pref-segment-<group>-<value>" → "<group>"
          return testid.split("-").slice(2, 3).join("");
        },
      ),
    );
    return toggles.length + segmentGroups.size;
  }

  private columnAt(index: number): HTMLElement {
    const column = within(this.root).getAllByTestId("prefs-column")[index];

    if (!column) {
      throw new Error(`no preferences column at index ${index}`);
    }

    return column;
  }

  /** True when the given ambient-style option is the active one in the REAL
   * "Ambient style" segment row (its `data-on`). */
  ambientStyleActive(style: AmbientStyle): boolean {
    return this.segmentActive("ambientStyle", style);
  }

  /** True when the given chart-substrate option is the active one in the REAL
   * "Chart renderer" segment row (its `data-on`). */
  chartSubstrateActive(substrate: ChartSubstrate): boolean {
    return this.segmentActive("chartSubstrate", substrate);
  }

  /** Each style written through useLoginWaitPreferences().setStyle, in order. */
  loginWaitStyleSets(): LoginWaitStyle[] {
    return this.commandLog().loginWaitStyleSets;
  }

  /** Each delay written through useLoginWaitPreferences().setDelay, in order. */
  loginWaitDelaySets(): LoginWaitDelay[] {
    return this.commandLog().loginWaitDelaySets;
  }

  /** Select an ambient-style option through the REAL "Ambient style" segment,
   * writing through the useAmbientStyle seam. */
  async selectAmbientStyle(style: AmbientStyle): Promise<void> {
    await this.selectSegment("ambientStyle", style);
  }

  /** Select a chart-substrate option through the REAL "Chart renderer" segment,
   * writing through the useChartSubstrate seam. */
  async selectChartSubstrate(substrate: ChartSubstrate): Promise<void> {
    await this.selectSegment("chartSubstrate", substrate);
  }

  /** True when the given Jarvis brain option is disabled (native `disabled`
   * attribute — a real brain the server isn't currently offering; "scripted"
   * is never disabled). */
  jarvisBrainDisabled(brain: JarvisBrain): boolean {
    return within(this.root)
      .getByTestId(`pref-segment-jarvisBrain-${brain}`)
      .hasAttribute("disabled");
  }

  /** The given Jarvis brain option's native `title` attribute, or `null`
   * when absent — a gated brain carries the budget-reset hint (matching the
   * hint line's own copy); a merely not-currently-offered (env-removed, not
   * gated) brain is disabled but carries NO title. */
  jarvisBrainOptionTitle(brain: JarvisBrain): string | null {
    return within(this.root)
      .getByTestId(`pref-segment-jarvisBrain-${brain}`)
      .getAttribute("title");
  }

  /** The Brain row's budget-gate hint line text, or `null` when not
   * rendered (no active gate — `jarvisState.gate === null`). */
  jarvisBrainHintText(): string | null {
    return (
      within(this.root)
        .queryByTestId("pref-segment-jarvisBrain-hint")
        ?.textContent?.trim() ?? null
    );
  }

  /** True when the whole Jarvis "Effort" row is disabled (every option's
   * native `disabled` — the row-level disable while the stored brain is
   * "scripted"). Checked via one option since the row-level `disabled` prop
   * applies uniformly to all of them. */
  jarvisEffortDisabled(): boolean {
    return within(this.root)
      .getByTestId("pref-segment-jarvisEffort-low")
      .hasAttribute("disabled");
  }

  /** Each brain written through useJarvisPreferences().setBrain, in order. */
  jarvisBrainSets(): JarvisBrain[] {
    return this.commandLog().jarvisBrainSets;
  }

  /** Each effort written through useJarvisPreferences().setEffort, in order. */
  jarvisEffortSets(): JarvisEffort[] {
    return this.commandLog().jarvisEffortSets;
  }

  /** Each narrator preference written through
   * useJarvisPreferences().setNarrator, in order — the World's own
   * storage-fake command log standing in for the real
   * LocalStoragePreferencesAdapter (Task 12/P5). */
  jarvisNarratorSets(): JarvisNarratorPreference[] {
    return this.commandLog().jarvisNarratorSets;
  }
}

/** The section headings the modal renders. Kept as a set so `sectionsInColumn`
 * can pick heading elements out of a column without depending on the CSS
 * module's hashed class name. */
const SECTION_LABELS = new Set([
  "DISPLAY",
  "MOTION",
  "TRADING",
  "NOTIFICATIONS",
  "DATA & PRIVACY",
  "JARVIS",
]);
