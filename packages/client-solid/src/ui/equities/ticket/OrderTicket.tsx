import {
  type Accessor,
  createEffect,
  createMemo,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";

import type { OrderTicketIntents, OrderTicketState } from "@rtc/client-core";
import type {
  EquityOrder,
  EquityQuote,
  OrderSide,
  OrderType,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./OrderTicket.module.css";

/**
 * Equity order ticket — BUY/SELL + Market/Limit toggles, a qty stepper,
 * conditional limit price, a cost summary, and a big accent Submit. Reads all
 * state from useOrderTicket(symbol) and animation intent from
 * useAnimationIntents(`ticket:${symbol}`). The traded symbol defaults to the
 * shared eqWorkspace selection when no `symbol` prop is given — the eq-ticket
 * dock panel (Task 6) mounts it with no symbol, relying on that fallback; the
 * visual/contract specs still pass an explicit symbol to pin a fixed AAPL shot.
 *
 * Phase → data-phase: editing | submitting | working | partiallyFilled |
 *                      filled | rejected
 * Animation → data-anim="fill" when intent kind === "fill" (fill choreography).
 *
 * Symbol sync (C1 fix): `useOrderTicket` (via `useMachine`) instantiates the
 * underlying OrderTicketMachine ONCE per mount — its `form.symbol` is frozen
 * at whatever `sym` was on setup. The eq-ticket dock panel never remounts, so
 * without an explicit sync, changing the workspace selection (click a
 * different watchlist row) would leave the ticket trading its STALE initial
 * symbol while every visible affordance (CTA, quote, est. cost) already shows
 * the new one — the exact live bug (select MSFT, place an AAPL order). The
 * effect below calls `ticket.setSymbol(sym())` whenever the workspace
 * selection drifts from the machine's current form.symbol, but ONLY while the
 * machine is in the "editing" phase: once a submit is in-flight
 * (submitting/working/partiallyFilled/filled/rejected) the ticket is
 * displaying an order already placed against the OLD symbol, and a selection
 * change must never retarget or clobber that in-flight/terminal state — the
 * next edit simply starts on the new symbol once the machine returns to
 * editing (on mount, or after reset()).
 *
 * SOLID PORT NOTE: the ticket MACHINE (`useOrderTicket`) must never remount —
 * that would reset in-flight/terminal state, defeating the sync effect above.
 * But `useEquityQuote`/`useAnimationIntents` DO need to track a changing
 * `sym()` live, and (unlike a plain accessor read) a hook-shaped viewmodel
 * call may only appear at a component's TOP LEVEL — so `TicketBody` below is
 * a separate child, keyed on `sym()`: Solid's keyed `<Show>` fully remounts it
 * (fresh `useEquityQuote`/`useAnimationIntents` calls) whenever the symbol
 * changes, while `ticket` itself stays a stable reference created once here in
 * the parent and passed down as a prop, untouched by that remount.
 */
export function OrderTicket(props: OrderTicketProps): JSX.Element {
  const { useOrderTicket, useEqWorkspace } = useViewModel();
  const workspace = useEqWorkspace();
  const sym = createMemo((): string => {
    return props.symbol ?? workspace.state().sel;
  });
  // Per-mount machine — instantiated ONCE with whatever `sym()` resolves to at
  // setup (mirrors the react original's "frozen at first render" machine).
  const ticket = useOrderTicket(sym());

  const formSymbol = createMemo((): string | undefined => {
    const s = ticket.state();
    return s.phase === "editing" ? s.form.symbol : undefined;
  });

  createEffect(() => {
    const fs = formSymbol();
    const current = sym();

    if (fs !== undefined && fs !== current) {
      ticket.setSymbol(current);
    }
  });

  return (
    <Show when={sym()} keyed>
      {(symbol: string): JSX.Element => {
        return <TicketBody symbol={symbol} ticket={ticket} />;
      }}
    </Show>
  );
}

const BUYING_POWER = "$250,000";
const QTY_STEP = 10;

/** Rounds to the nearest integer and formats with thousands separators —
 * mirrors the prototype's `fmtNum` (Ticket/OrderTicketPanel.tsx). */
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

interface OrderTicketProps {
  symbol?: string;
}

type TicketMachine = { state: Accessor<OrderTicketState> } & OrderTicketIntents;

interface TicketBodyProps {
  symbol: string;
  ticket: TicketMachine;
}

function TicketBody(props: TicketBodyProps): JSX.Element {
  const { useEquityQuote, useAnimationIntents } = useViewModel();
  const quote = useEquityQuote(props.symbol);
  const animIntent = useAnimationIntents(`ticket:${props.symbol}`);

  const animAttr = createMemo((): "fill" | undefined => {
    return animIntent()?.kind === "fill" ? "fill" : undefined;
  });
  const workingOrder = createMemo((): EquityOrder | undefined => {
    const s = props.ticket.state();
    return s.phase === "working" ? s.order : undefined;
  });
  const partialOrder = createMemo((): EquityOrder | undefined => {
    const s = props.ticket.state();
    return s.phase === "partiallyFilled" ? s.order : undefined;
  });
  const filledOrder = createMemo((): EquityOrder | undefined => {
    const s = props.ticket.state();
    return s.phase === "filled" ? s.order : undefined;
  });
  const rejectedReason = createMemo((): string | undefined => {
    const s = props.ticket.state();
    return s.phase === "rejected" ? s.reason : undefined;
  });
  const editing = createMemo((): boolean => {
    return props.ticket.state().phase === "editing";
  });

  return (
    <Switch>
      <Match when={props.ticket.state().phase === "submitting"}>
        <div
          data-testid="order-ticket"
          data-phase="submitting"
          data-anim={animAttr()}
          class={styles.ticket}
        >
          <div class={styles.status}>SUBMITTING…</div>
        </div>
      </Match>
      <Match when={workingOrder()}>
        {(order: Accessor<EquityOrder>): JSX.Element => {
          return (
            <div
              data-testid="order-ticket"
              data-phase="working"
              data-anim={animAttr()}
              class={styles.ticket}
            >
              <div class={styles.status}>
                WORKING — {order().filledQty}/{order().qty} filled
              </div>
              <button
                type="button"
                class={styles.resetBtn}
                onClick={props.ticket.reset}
              >
                RESET
              </button>
            </div>
          );
        }}
      </Match>
      <Match when={partialOrder()}>
        {(order: Accessor<EquityOrder>): JSX.Element => {
          return (
            <div
              data-testid="order-ticket"
              data-phase="partiallyFilled"
              data-anim={animAttr()}
              class={styles.ticket}
            >
              <div class={styles.status}>
                PARTIAL — {order().filledQty}/{order().qty} @{" "}
                {order().avgPrice?.toFixed(2) ?? "—"}
              </div>
              <button
                type="button"
                class={styles.resetBtn}
                onClick={props.ticket.reset}
              >
                RESET
              </button>
            </div>
          );
        }}
      </Match>
      <Match when={filledOrder()}>
        {(order: Accessor<EquityOrder>): JSX.Element => {
          return (
            <div
              data-testid="order-ticket"
              data-phase="filled"
              data-anim={animAttr()}
              class={styles.ticket}
            >
              <div class={styles.status}>
                FILLED — {order().qty} @ {order().avgPrice?.toFixed(2) ?? "—"}
              </div>
              <button
                type="button"
                class={styles.resetBtn}
                onClick={props.ticket.reset}
              >
                NEW ORDER
              </button>
            </div>
          );
        }}
      </Match>
      <Match when={rejectedReason()}>
        {(reason: Accessor<string>): JSX.Element => {
          return (
            <div
              data-testid="order-ticket"
              data-phase="rejected"
              data-anim={animAttr()}
              class={styles.ticket}
            >
              <div class={styles.status}>REJECTED — {reason()}</div>
              <button
                type="button"
                class={styles.resetBtn}
                onClick={props.ticket.reset}
              >
                RETRY
              </button>
            </div>
          );
        }}
      </Match>
      <Match when={editing()}>
        <EditingTicket
          symbol={props.symbol}
          quote={quote}
          animAttr={animAttr}
          state={props.ticket.state}
          setSide={props.ticket.setSide}
          setType={props.ticket.setType}
          setQty={props.ticket.setQty}
          setLimitPrice={props.ticket.setLimitPrice}
          submit={props.ticket.submit}
        />
      </Match>
    </Switch>
  );
}

interface EditingTicketProps {
  symbol: string;
  quote: Accessor<EquityQuote | null>;
  animAttr: Accessor<"fill" | undefined>;
  state: Accessor<OrderTicketState>;
  setSide: (side: OrderSide) => void;
  setType: (type: OrderType) => void;
  setQty: (qty: number) => void;
  setLimitPrice: (price: number | undefined) => void;
  submit: () => void;
}

function EditingTicket(props: EditingTicketProps): JSX.Element {
  const form = createMemo(() => {
    const s = props.state();
    return s.phase === "editing" ? s.form : undefined;
  });
  const error = createMemo(() => {
    const s = props.state();
    return s.phase === "editing" ? s.error : null;
  });
  const isLimit = createMemo((): boolean => {
    return form()?.type === "limit";
  });
  const live = createMemo((): number => {
    return props.quote()?.last ?? 0;
  });
  // PROTO Ticket/OrderTicketPanel.tsx:24 — a limit order costs at the limit
  // price ONLY once one has actually been entered; a blank/zero limit still
  // prices off the live last (matches the prototype's `limitN ? limitN : last`).
  const unitPrice = createMemo((): number => {
    const f = form();
    return isLimit() && f?.limitPrice ? f.limitPrice : live();
  });
  const estCost = createMemo((): number => {
    return (form()?.qty ?? 0) * unitPrice();
  });

  function stepQty(delta: number): void {
    const f = form();

    if (!f) {
      return;
    }

    props.setQty(Math.max(0, f.qty + delta));
  }

  function handleQtyChange(e: InputChangeEvent): void {
    const n = Number(e.currentTarget.value);

    if (Number.isFinite(n)) {
      props.setQty(n);
    }
  }

  function handleLimitPriceChange(e: InputChangeEvent): void {
    const raw = e.currentTarget.value;
    const n = raw === "" ? undefined : Number(raw);
    props.setLimitPrice(Number.isFinite(n) ? n : undefined);
  }

  return (
    <div
      data-testid="order-ticket"
      data-phase="editing"
      data-anim={props.animAttr()}
      class={styles.ticket}
    >
      {/* Side toggle: Buy / Sell */}
      <div class={styles.sideToggle}>
        <button
          type="button"
          data-side="buy"
          data-active={form()?.side === "buy" ? "true" : "false"}
          class={styles.side}
          onClick={() => {
            props.setSide("buy");
          }}
        >
          BUY
        </button>
        <button
          type="button"
          data-side="sell"
          data-active={form()?.side === "sell" ? "true" : "false"}
          class={styles.side}
          onClick={() => {
            props.setSide("sell");
          }}
        >
          SELL
        </button>
      </div>

      {/* Type toggle: Market / Limit */}
      <span class={styles.label}>ORDER TYPE</span>
      <div class={styles.typeRow}>
        <button
          type="button"
          data-kind="type"
          data-active={form()?.type === "market" ? "true" : "false"}
          class={styles.type}
          onClick={() => {
            props.setType("market");
          }}
        >
          MARKET
        </button>
        <button
          type="button"
          data-kind="type"
          data-active={form()?.type === "limit" ? "true" : "false"}
          class={styles.type}
          onClick={() => {
            props.setType("limit");
          }}
        >
          LIMIT
        </button>
      </div>

      {/* Quantity stepper */}
      <span class={styles.label}>QUANTITY</span>
      <div class={styles.qtyRow}>
        <button
          type="button"
          data-testid="order-ticket-qty-dec"
          class={styles.step}
          onClick={() => {
            stepQty(-QTY_STEP);
          }}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          step={1}
          class={styles.qtyInput}
          value={form()?.qty === 0 ? "" : (form()?.qty ?? "")}
          placeholder="0"
          onInput={handleQtyChange}
          onChange={handleQtyChange}
        />
        <button
          type="button"
          data-testid="order-ticket-qty-inc"
          class={styles.step}
          onClick={() => {
            stepQty(QTY_STEP);
          }}
        >
          +
        </button>
      </div>

      {/* Conditional limit price */}
      <Show when={isLimit()}>
        <span class={styles.label}>LIMIT PRICE</span>
        <input
          type="number"
          min={0}
          step={0.01}
          class={styles.input}
          value={form()?.limitPrice ?? ""}
          placeholder={live().toFixed(2)}
          onInput={handleLimitPriceChange}
          onChange={handleLimitPriceChange}
        />
      </Show>

      {/* Validation error */}
      <Show when={!!error()}>
        <div class={styles.error}>{error()}</div>
      </Show>

      {/* Cost summary */}
      <div class={styles.summary}>
        <SummaryRow
          label="Est. Cost"
          value={`$${fmtNum(estCost())}`}
          testId="order-ticket-est-cost"
        />
        <SummaryRow label="Buying Power" value={BUYING_POWER} />
        <SummaryRow label="Time in Force" value="Day" dim />
      </div>

      {/* Submit */}
      <button
        type="button"
        data-testid="order-ticket-submit"
        data-side={form()?.side}
        class={styles.submit}
        onClick={props.submit}
      >
        {form()?.side === "buy" ? "BUY" : "SELL"} {props.symbol}
      </button>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  dim?: boolean;
  testId?: string;
}

function SummaryRow(props: SummaryRowProps): JSX.Element {
  return (
    <div class={styles.summaryRow}>
      <span class={styles.summaryLabel}>{props.label}</span>
      <span
        data-testid={props.testId}
        class={styles.summaryValue}
        data-dim={props.dim ? "true" : "false"}
      >
        {props.value}
      </span>
    </div>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
