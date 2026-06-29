import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

const ROW_PREFIX = "order-row-";

/**
 * Page object for the equity OrdersBlotter. The blotter is dumb: it reads its
 * rows from `useEquityOrders()` and paints each order's status into
 * `data-status`. Specs seed the orders via `mount(..., { equities: { orders }})`.
 */
export class OrdersBlotterPage extends MountedComponent<Record<string, never>> {
  /** Number of order rows rendered (0 in the empty state). */
  rowCount(): number {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`))
      .length;
  }

  /** The status a given order row paints, via `data-status`. */
  statusOf(id: string): string | null {
    return within(this.root)
      .getByTestId(`${ROW_PREFIX}${id}`)
      .getAttribute("data-status");
  }

  /** True when the empty-state placeholder is shown (no orders). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no orders/i) !== null;
  }
}
