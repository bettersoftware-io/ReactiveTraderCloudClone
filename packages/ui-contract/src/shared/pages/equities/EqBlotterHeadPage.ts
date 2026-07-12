import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** Page object for the equities blotter's head slot — the ▤ Orders /
 * ◴ Positions tabs plus the live row count. */
export class EqBlotterHeadPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  activeTab(): "orders" | "positions" {
    const ordersActive =
      within(this.root)
        .getByTestId("blotter-tab-orders")
        .getAttribute("data-active") === "true";

    return ordersActive ? "orders" : "positions";
  }

  count(): string {
    return within(this.root).getByTestId("blotter-count").textContent ?? "";
  }

  async selectOrders(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("blotter-tab-orders"));
  }

  async selectPositions(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("blotter-tab-positions"),
    );
  }
}
