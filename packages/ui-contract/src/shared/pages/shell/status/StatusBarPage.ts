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
}
