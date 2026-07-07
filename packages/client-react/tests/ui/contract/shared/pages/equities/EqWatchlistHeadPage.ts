import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for the Watchlist panel's head slot — the ⇅ sort-cycle chip. */
export class EqWatchlistHeadPage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  /** The sort chip's current label (A–Z / % CHG / PRICE). */
  label(): string {
    return (
      within(this.root).getByTestId("watchlist-sort-cycle").textContent ?? ""
    );
  }

  /** Click the ⇅ chip — advances the shared sort preference one step. */
  async cycle(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("watchlist-sort-cycle"),
    );
  }
}
