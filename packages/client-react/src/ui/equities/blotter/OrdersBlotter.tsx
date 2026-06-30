import type { ReactElement } from "react";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./OrdersBlotter.module.css";

export function OrdersBlotter(): ReactElement {
  const { useEquityOrders } = useViewModel();
  const orders = useEquityOrders();

  if (orders.length === 0) {
    return <div className={styles.empty}>NO ORDERS</div>;
  }

  return (
    <div className={styles.blotter}>
      <div className={styles.header}>
        <span>SYMBOL</span>
        <span>SIDE</span>
        <span>TYPE</span>
        <span>QTY</span>
        <span>PRICE</span>
        <span>STATUS</span>
      </div>
      {orders.map((order) => {
        return (
          <div
            key={order.id}
            data-testid={`order-row-${order.id}`}
            data-status={order.status}
            className={styles.row}
          >
            <span className={styles.symbol}>{order.symbol}</span>
            <span data-side={order.side} className={styles.side}>
              {order.side.toUpperCase()}
            </span>
            <span className={styles.type}>{order.type}</span>
            <span className={styles.qty}>
              {order.filledQty}/{order.qty}
            </span>
            <span className={styles.price}>
              {order.avgPrice ? order.avgPrice.toFixed(2) : "—"}
            </span>
            <span className={styles.statusBadge}>
              {order.status.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
