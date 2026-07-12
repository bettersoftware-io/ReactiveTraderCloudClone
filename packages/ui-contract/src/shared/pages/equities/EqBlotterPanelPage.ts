import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

const ORDER_ROW_PREFIX = "order-row-";
const POSITION_ROW_PREFIX = "position-row-";

/**
 * Page object for EqBlotterPanel — the data-owning body that reads
 * useEquityOrders/useEquityPositions/useEqBlotterView and renders whichever
 * table (OrdersTable/PositionsTable) the shared blotter-view preference
 * selects.
 */
export class EqBlotterPanelPage extends MountedComponent<
  Record<string, never>
> {
  ordersRowCount(): number {
    return within(this.root).queryAllByTestId(
      new RegExp(`^${ORDER_ROW_PREFIX}`),
    ).length;
  }

  positionsRowCount(): number {
    return within(this.root).queryAllByTestId(
      new RegExp(`^${POSITION_ROW_PREFIX}`),
    ).length;
  }

  /** True when the given order's row is currently flashing (data-new). */
  isNewOrder(id: string): boolean {
    return (
      within(this.root)
        .getByTestId(`${ORDER_ROW_PREFIX}${id}`)
        .getAttribute("data-new") === "true"
    );
  }
}
