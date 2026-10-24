import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** Page object for UsersHead — the Users panel's head slot: the pending
 * count and the Refresh control. */
export class UsersHeadPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** The pending count's text ("2 pending"), or null when absent. */
  pendingText(): string | null {
    return (
      within(this.root)
        .queryByTestId("users-head-pending")
        ?.textContent?.trim() ?? null
    );
  }

  /** True when the Refresh control is shown. */
  hasRefresh(): boolean {
    return within(this.root).queryByTestId("users-refresh") !== null;
  }

  /** The Refresh control's visible label. */
  refreshLabel(): string {
    return (
      within(this.root).getByTestId("users-refresh").textContent?.trim() ?? ""
    );
  }

  /** Click Refresh. */
  async clickRefresh(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("users-refresh"));
  }

  /** How many times the UI asked for a refresh. */
  refreshCount(): number {
    return this.commandLog().accountListRefreshes;
  }
}
