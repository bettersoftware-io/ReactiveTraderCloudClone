import type { ReactElement } from "react";

import styles from "#/equities/Blotter/EqBlotterPanel.module.css";
import { OrdersTable } from "#/equities/Blotter/OrdersTable";
import { PositionsTable } from "#/equities/Blotter/PositionsTable";
import type { EqOrder, EqPosition } from "#/equities/types";

export type EqBlotView = "orders" | "positions";

export interface EqBlotterPanelProps {
  orders: EqOrder[];
  positions: EqPosition[];
  view: EqBlotView;
  onView(view: EqBlotView): void;
  newOrderId: number | null;
}

// PROTO L626-638: the equities blotter body — an Orders/Positions tab sub-head
// with a count, then the active table. (The outer dock Panel owns maximize.)
export function EqBlotterPanel(props: EqBlotterPanelProps): ReactElement {
  const { orders, positions, view, onView, newOrderId } = props;
  const count =
    view === "orders"
      ? `${orders.length} orders`
      : `${positions.length} positions`;

  function showOrders(): void {
    onView("orders");
  }

  function showPositions(): void {
    onView("positions");
  }

  return (
    <div className={styles.body}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "orders")}
          onClick={showOrders}
        >
          ▤ Orders
        </button>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "positions")}
          onClick={showPositions}
        >
          ◴ Positions
        </button>
        <span className={styles.spacer} />
        <span className={styles.count}>{count}</span>
      </div>
      {view === "orders" ? (
        <OrdersTable orders={orders} newOrderId={newOrderId} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </div>
  );
}
