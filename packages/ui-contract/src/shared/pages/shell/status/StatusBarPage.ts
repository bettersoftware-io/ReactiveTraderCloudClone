import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for the shell StatusBar. It embeds the hook-driven
 * ConnectionStatusBar (connection segment, real), the session operator segment
 * (real), and the decorative CosmeticMetrics — so it carries no props.
 */
export class StatusBarPage extends MountedComponent<Record<string, never>> {
  /** True when the status bar landmark is rendered. */
  isRendered(): boolean {
    return within(this.root).queryByRole("contentinfo") !== null;
  }

  /** The connection-status label shown inside the status bar. */
  connectionText(): string {
    return (
      within(this.root).getByTestId("connection-status").textContent?.trim() ??
      ""
    );
  }

  /** The operator id shown in the status bar (wired to the session seam). */
  operator(): string {
    return (
      within(this.root).getByTestId("status-operator").textContent?.trim() ?? ""
    );
  }

  /** True when the decorative cosmetic metrics block is present. */
  hasCosmeticMetrics(): boolean {
    return within(this.root).queryByTestId("cosmetic-metrics") !== null;
  }

  /** The decorative build string shown in the metrics block. */
  buildText(): string {
    return (
      within(this.root)
        .getByText(/build v/i)
        .textContent?.trim() ?? ""
    );
  }

  /** True when the JarvisStatusChip is rendered — false while Jarvis is
   * unavailable (the chip renders nothing). */
  jarvisChipPresent(): boolean {
    return within(this.root).queryByTestId("jarvis-status-chip") !== null;
  }

  /** The chip's `data-brain` attribute — the machine's effective brain. */
  jarvisChipBrain(): string | null {
    return within(this.root)
      .getByTestId("jarvis-status-chip")
      .getAttribute("data-brain");
  }

  /** The chip's rendered text (e.g. "JARVIS · Opus 5"). */
  jarvisChipText(): string {
    return (
      within(this.root).getByTestId("jarvis-status-chip").textContent?.trim() ??
      ""
    );
  }

  /** The chip's `data-gate` attribute — the active budget gate's level
   * ("soft" | "hard"), or `null` when no gate is active (the attribute is
   * absent entirely, not an empty string). */
  jarvisChipGateLevel(): string | null {
    return within(this.root)
      .getByTestId("jarvis-status-chip")
      .getAttribute("data-gate");
  }
}
