import { waitFor, within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";
import type { CommandLog } from "#tests/ui/contract/shared/harness/world";

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
    // Strip inner button text from the message so assertions target the <p> only.
    const p = el?.querySelector("p");
    return p?.textContent?.trim() ?? null;
  }

  /** The Reconnect button element, or null when absent. */
  reconnectButton(): HTMLButtonElement | null {
    // queryByTestId returns null when absent, so the cast alone suffices.
    return within(this.root).queryByTestId(
      "reconnect-button",
    ) as HTMLButtonElement | null;
  }

  /** Click the Reconnect button (throws if absent). */
  clickReconnect(): void {
    const btn = this.reconnectButton();
    if (!btn) throw new Error("Reconnect button not found");
    btn.click();
  }

  /** Wait until the overlay becomes visible (e.g. after an incident inject). */
  async waitUntilVisible(): Promise<void> {
    await waitFor(() => {
      if (!this.isVisible())
        throw new Error("ConnectionOverlay did not become visible");
    });
  }

  /** Wait until the overlay is hidden (e.g. after clear). */
  async waitUntilHidden(): Promise<void> {
    await waitFor(() => {
      if (this.isVisible())
        throw new Error("ConnectionOverlay is still visible");
    });
  }

  /** The Clear incident button element, or null when absent. */
  clearIncidentButton(): HTMLButtonElement | null {
    return within(this.root).queryByTestId(
      "connection-overlay-clear-incident",
    ) as HTMLButtonElement | null;
  }

  /** Click the "Clear incident" button on the overlay (throws if absent). */
  clearIncident(): void {
    const btn = this.clearIncidentButton();
    if (!btn) throw new Error("Clear incident button not found on overlay");
    btn.click();
  }

  /** Command invocations captured during the test (e.g. reconnect count). */
  get commands(): CommandLog {
    return this.commandLog();
  }
}
