import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { OrdersTable } from "./OrdersTable";
import { PositionsTable } from "./PositionsTable";
import { useNewestOrderId } from "./useNewestOrderId";

import styles from "./EqBlotterPanel.module.css";

/**
 * The Orders/Positions blotter body — renders whichever table the shared
 * `useEqBlotterView()` preference (the head's ▤/◴ tabs, EqBlotterHead)
 * currently selects. Bare: the dock Panel's chrome (border/background/
 * maximize) is owned by the layout engine, not this component — mirrors
 * WatchlistPanel/ChartPanel.
 */
export function EqBlotterPanel(): ReactElement {
  const { useEquityOrders, useEquityPositions, useEqBlotterView } =
    useViewModel();
  const orders = useEquityOrders();
  const positions = useEquityPositions();
  const { view } = useEqBlotterView();
  const newOrderId = useNewestOrderId(orders);

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
