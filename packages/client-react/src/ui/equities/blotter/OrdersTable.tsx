import type { CSSProperties, ReactElement } from "react";

import type {
  EquityOrder,
  OrderSide,
  OrderStatus,
  OrderType,
} from "@rtc/domain";

import styles from "./OrdersTable.module.css";

/**
 * The equities Orders blotter body — a sticky 7-column header over one row
 * per `useEquityOrders()` order, ported from client-prototype's OrdersTable.
 * Pure/prop-driven (mirrors CandleChart/InstrumentHeader): the data owner is
 * EqBlotterPanel, which also computes `newOrderId` (id-diff, no timers, see
 * useNewestOrderId).
 */
export function OrdersTable({
  orders,
  newOrderId,
}: OrdersTableProps): ReactElement {
  if (orders.length === 0) {
    return (
      <div className={styles.empty}>No orders — submit one from the ticket</div>
    );
  }

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        {HEADERS.map((header) => {
          return <span key={header}>{header}</span>;
        })}
      </div>
      {orders.map((order) => {
        return (
          <OrdersRow
            key={order.id}
            order={order}
            isNew={order.id === newOrderId}
          />
        );
      })}
    </div>
  );
}

export interface OrdersTableProps {
  orders: readonly EquityOrder[];
  /** The order id to flash via `data-new`, or null — computed upstream by
   * useNewestOrderId, an explicit prop here so this component stays pure. */
  newOrderId: string | null;
}

const HEADERS = ["Time", "Symbol", "Side", "Type", "Qty", "Price", "Status"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Working",
  working: "Working",
  partiallyFilled: "Partial",
  filled: "Filled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

interface OrdersRowProps {
  order: EquityOrder;
  isNew: boolean;
}

function OrdersRow({ order, isNew }: OrdersRowProps): ReactElement {
  const accent =
    order.side === "buy" ? "var(--accent-positive)" : "var(--accent-negative)";

  return (
    <div
      data-testid={`order-row-${order.id}`}
      data-status={order.status}
      data-new={isNew ? "true" : "false"}
      className={styles.row}
      // eslint-disable-next-line no-restricted-syntax -- runtime side accent via CSS custom property; static CSS can't express it
      style={{ "--row-acc": accent } as CSSProperties}
    >
      <span className={styles.dim}>{clock(order.createdAt)}</span>
      <span className={styles.sym}>{order.symbol}</span>
      <span className={styles.side} data-side={order.side}>
        {capitalize(order.side)}
      </span>
      <span className={styles.dim}>{capitalize(order.type)}</span>
      <span>{qtyText(order)}</span>
      <span>{priceText(order)}</span>
      <span className={styles.status} data-status={order.status}>
        {STATUS_LABEL[order.status]}
      </span>
    </div>
  );
}

function capitalize(value: OrderSide | OrderType): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function qtyText(order: EquityOrder): string {
  if (order.status === "partiallyFilled") {
    return `${order.filledQty.toLocaleString()}/${order.qty.toLocaleString()}`;
  }

  return order.qty.toLocaleString();
}

function priceText(order: EquityOrder): string {
  const price = order.avgPrice ?? order.limitPrice;

  return price !== undefined ? `$${price.toFixed(2)}` : "—";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// HH:MM:SS from the order's createdAt timestamp — pure, locale-stable
// formatting (mirrors LiveEventLog's clock()), no Date.now.
function clock(createdAt: number): string {
  const d = new Date(createdAt);

  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
