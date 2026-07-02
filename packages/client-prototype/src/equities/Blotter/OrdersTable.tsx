import type { CSSProperties, ReactElement } from "react";

import styles from "#/equities/Blotter/OrdersTable.module.css";
import { fmtNum } from "#/equities/equitiesData";
import type { EqOrder } from "#/equities/types";

export interface OrdersTableProps {
  orders: EqOrder[];
  newOrderId: number | null;
}

const HEADERS = ["Time", "Symbol", "Side", "Type", "Qty", "Price", "Status"];

// PROTO L627-630: the orders grid — a sticky 7-column header over one row per
// order; the just-submitted order flashes via the shared rowIn/rowFlash keyframes.
export function OrdersTable(props: OrdersTableProps): ReactElement {
  const { orders, newOrderId } = props;

  if (orders.length === 0) {
    return (
      <div className={styles.empty}>No orders — submit one from the ticket</div>
    );
  }

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        {HEADERS.map((h) => {
          return <span key={h}>{h}</span>;
        })}
      </div>
      {orders.map((o) => {
        return <OrdersRow key={o.id} order={o} isNew={o.id === newOrderId} />;
      })}
    </div>
  );
}

interface OrdersRowProps {
  order: EqOrder;
  isNew: boolean;
}

function OrdersRow(props: OrdersRowProps): ReactElement {
  const { order, isNew } = props;
  const accent = order.side === "Buy" ? "var(--buy)" : "var(--sell)";
  const accentStyle = { "--row-acc": accent } as CSSProperties;

  return (
    <div
      className={styles.row}
      data-order-id={order.id}
      data-new={String(isNew)}
      style={accentStyle}
    >
      <span className={styles.dim}>{order.time}</span>
      <span className={styles.sym}>{order.sym}</span>
      <span className={styles.side} data-side={order.side}>
        {order.side}
      </span>
      <span className={styles.dim}>{order.type}</span>
      <span>{fmtNum(order.qty)}</span>
      <span>${order.price.toFixed(2)}</span>
      <span className={styles.status} data-status={order.status}>
        {order.status}
      </span>
    </div>
  );
}
