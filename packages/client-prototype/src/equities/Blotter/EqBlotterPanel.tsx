import type { ReactElement } from "react";

import styles from "#/equities/Blotter/EqBlotterPanel.module.css";
import { OrdersTable } from "#/equities/Blotter/OrdersTable";
import { PositionsTable } from "#/equities/Blotter/PositionsTable";
import type { EqOrder, EqPosition } from "#/equities/types";

export type EqBlotView = "orders" | "positions";

export interface EqBlotterPanelControlsProps {
  view: EqBlotView;
  onView(view: EqBlotView): void;
  ordersCount: number;
  positionsCount: number;
}

// PROTO L626-638: the equities blotter's control row — the Orders/Positions
// tab toggle + a live count — hoisted out of the body so the dock Panel's
// headControls renders it inline in the single head bar.
export function EqBlotterPanelControls(
  props: EqBlotterPanelControlsProps,
): ReactElement {
  const { view, onView, ordersCount, positionsCount } = props;
  const count =
    view === "orders" ? `${ordersCount} orders` : `${positionsCount} positions`;

  function showOrders(): void {
    onView("orders");
  }

  function showPositions(): void {
    onView("positions");
  }

  return (
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
      <span className={styles.count}>{count}</span>
    </div>
  );
}

export interface EqBlotterPanelProps {
  orders: EqOrder[];
  positions: EqPosition[];
  view: EqBlotView;
  newOrderId: number | null;
}

// PROTO L626-638: the equities blotter body — the active table. (The control
// row is EqBlotterPanelControls, rendered by the dock Panel's headControls;
// the outer dock Panel owns maximize.)
export function EqBlotterPanel(props: EqBlotterPanelProps): ReactElement {
  const { orders, positions, view, newOrderId } = props;

  return (
    <div className={styles.body}>
      {view === "orders" ? (
        <OrdersTable orders={orders} newOrderId={newOrderId} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </div>
  );
}
