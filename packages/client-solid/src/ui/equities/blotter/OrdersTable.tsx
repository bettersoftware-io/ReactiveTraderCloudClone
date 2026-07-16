import { For, type JSX, Show } from "solid-js";

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
export function OrdersTable(props: OrdersTableProps): JSX.Element {
  return (
    <Show
      when={props.orders.length > 0}
      fallback={
        <div class={styles.empty}>No orders — submit one from the ticket</div>
      }
    >
      <div class={styles.table}>
        <div class={styles.headerRow}>
          <For each={HEADERS}>
            {(header: string): JSX.Element => {
              return <span>{header}</span>;
            }}
          </For>
        </div>
        <For each={props.orders}>
          {(order: EquityOrder): JSX.Element => {
            return (
              <OrdersRow order={order} isNew={order.id === props.newOrderId} />
            );
          }}
        </For>
      </div>
    </Show>
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

function OrdersRow(props: OrdersRowProps): JSX.Element {
  const accent =
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    props.order.side === "buy"
      ? "var(--accent-positive)"
      : "var(--accent-negative)";

  return (
    <div
      data-testid={`order-row-${props.order.id}`}
      data-status={props.order.status}
      data-new={props.isNew ? "true" : "false"}
      class={styles.row}
      // eslint-disable-next-line no-restricted-syntax -- runtime side accent via CSS custom property; static CSS can't express it
      style={{ "--row-acc": accent }}
    >
      <span class={styles.dim}>{clock(props.order.createdAt)}</span>
      <span class={styles.sym}>{props.order.symbol}</span>
      <span class={styles.side} data-side={props.order.side}>
        {capitalize(props.order.side)}
      </span>
      <span class={styles.dim}>{capitalize(props.order.type)}</span>
      <span>{qtyText(props.order)}</span>
      <span>{priceText(props.order)}</span>
      <span class={styles.status} data-status={props.order.status}>
        {STATUS_LABEL[props.order.status]}
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
