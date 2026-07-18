import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

export interface PreferencesModalProps {
  open: boolean;
  onClose: () => void;
}

const POWER_SAVER_LEVELS = ["off", "calm", "freeze"] as const;

/**
 * Page object for PreferencesModal. THREE rows are REAL controls: the
 * Animated-background toggle (wired to useAnimatedBackground), the Power
 * saver segment (wired to usePowerSaver, 3-state Off/Calm/Freeze), and the
 * Always-play-boot-animation toggle (wired to useForceBootAnimation); each
 * seam records its written values, asserted via `animatedBgSets()` /
 * `powerSaverLevelSets()` / `forceBootAnimationSets()`. Cosmetic rows are
 * checked for presence only.
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
}
