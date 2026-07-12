import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

export class ConnectionStatusBarPage extends MountedComponent<
  Record<string, never>
> {
  /** The human-readable connection status label, e.g. "Connected". */
  statusText(): string {
    return (
      within(this.root).getByTestId("connection-status").textContent?.trim() ??
      ""
    );
  }
}
