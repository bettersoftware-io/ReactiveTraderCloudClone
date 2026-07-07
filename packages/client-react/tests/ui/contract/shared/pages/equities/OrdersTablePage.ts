import { within } from "@testing-library/dom";

import type { EquityOrder } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

const ROW_PREFIX = "order-row-";

/** Props the OrdersTable component reads — a pure props leaf (mirrors
 * CandleChart/InstrumentHeader): the data owner (EqBlotterPanel) computes
 * `newOrderId` via useNewestOrderId. */
export interface OrdersTableProps {
  orders: readonly EquityOrder[];
  newOrderId: string | null;
}

/**
 * Page object for the prototype-ported OrdersTable: Time/Symbol/Side/Type/
 * Qty/Price/Status columns, row accent by side, and the data-new flash flag.
 */
export class OrdersTablePage extends MountedComponent<OrdersTableProps> {
  rowCount(): number {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`))
      .length;
  }

  private row(id: string): HTMLElement {
    return within(this.root).getByTestId(`${ROW_PREFIX}${id}`);
  }

  statusOf(id: string): string | null {
    return this.row(id).getAttribute("data-status");
  }

  statusTextOf(id: string): string {
    return this.row(id).children[6]?.textContent ?? "";
  }

  sideTextOf(id: string): string {
    return this.row(id).children[2]?.textContent ?? "";
  }

  typeTextOf(id: string): string {
    return this.row(id).children[3]?.textContent ?? "";
  }

  qtyTextOf(id: string): string {
    return this.row(id).children[4]?.textContent ?? "";
  }

  priceTextOf(id: string): string {
    return this.row(id).children[5]?.textContent ?? "";
  }

  timeTextOf(id: string): string {
    return this.row(id).children[0]?.textContent ?? "";
  }

  isNew(id: string): boolean {
    return this.row(id).getAttribute("data-new") === "true";
  }

  isEmpty(): boolean {
    return within(this.root).queryByText(/no orders/i) !== null;
  }
}
