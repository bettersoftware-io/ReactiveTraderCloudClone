import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

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
export function EqBlotterPanel(): JSX.Element {
  const { useEquityOrders, useEquityPositions, useEqBlotterView } =
    useViewModel();
  const orders = useEquityOrders();
  const positions = useEquityPositions();
  const { view } = useEqBlotterView();
  const newOrderId = useNewestOrderId(orders);

  return (
    <div class={styles.body}>
      <Show
        when={view() === "orders"}
        fallback={<PositionsTable positions={positions()} />}
      >
        <OrdersTable orders={orders()} newOrderId={newOrderId()} />
      </Show>
    </div>
  );
}
