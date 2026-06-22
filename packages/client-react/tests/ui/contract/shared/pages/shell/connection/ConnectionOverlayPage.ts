import { within } from "@testing-library/dom";

import { MountedComponent } from "../../../harness/component";

/**
 * Page object for ConnectionOverlay. It is hook-driven (reads
 * `useConnectionStatus`) and renders nothing for healthy/idle statuses.
 */
export class ConnectionOverlayPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the blocking overlay is visible. */
  isVisible(): boolean {
    return within(this.root).queryByTestId("connection-overlay") !== null;
  }

  /** The overlay message, or null when no overlay is shown. */
  message(): string | null {
    const el = within(this.root).queryByTestId("connection-overlay");
    return el?.textContent?.trim() ?? null;
  }
}
