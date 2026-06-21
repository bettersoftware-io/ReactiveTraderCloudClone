import { within } from "@testing-library/dom";
import { MountedComponent } from "../../../harness/component";

/**
 * Page object for the shell Footer. It is a layout leaf that embeds the
 * hook-driven ConnectionStatusBar, so it carries no props.
 */
export class FooterPage extends MountedComponent<Record<string, never>> {
  /** True when the footer landmark is rendered. */
  isRendered(): boolean {
    return within(this.root).queryByRole("contentinfo") !== null;
  }

  /** The connection-status label shown inside the footer. */
  statusText(): string {
    return (
      within(this.root).getByTestId("connection-status").textContent?.trim() ??
      ""
    );
  }
}
