import type { Accessor, JSX } from "solid-js";
import { createMemo, Match, Switch } from "solid-js";

import type { TileExecutionState } from "@rtc/client-core";
import { Direction, ExecutionStatus, type Trade } from "@rtc/domain";

import { formatSpotDate } from "./formatSpotDate";

import styles from "./TileConfirmation.module.css";

export function TileConfirmation(props: TileConfirmationProps): JSX.Element {
  // Narrows the "finished + Done + has a trade" branch once, reactively —
  // Match's keyed render-prop form below hands the narrowed Trade to
  // DoneBody instead of every child re-deriving it from the raw union.
  const doneTrade = createMemo((): Trade | undefined => {
    const state = props.state();
    return state.status === "finished" &&
      state.executionStatus === ExecutionStatus.Done &&
      state.trade
      ? state.trade
      : undefined;
  });

  return (
    <Switch>
      <Match when={props.state().status === "started"}>
        <div
          data-testid="trade-confirmation"
          data-status={statusKey(props.state())}
          data-anim={props.anim}
          class={styles.overlay}
        >
          <ConfirmationContent state={props.state} />
        </div>
      </Match>
      {/* PROTO parity: the completed-trade confirmation is a dedicated card
       * (icon, verb, dealt line, RATE/SPT/ID row, a DISMISS chip) that only
       * the DISMISS button dismisses — unlike the other statuses, where the
       * whole overlay is a click-anywhere-to-dismiss button. */}
      <Match when={doneTrade()}>
        {(trade: Accessor<Trade>) => {
          return (
            <div
              data-testid="trade-confirmation"
              data-status={statusKey(props.state())}
              data-anim={props.anim}
              class={styles.overlay}
            >
              <DoneBody trade={trade()} onDismiss={props.onDismiss} />
            </div>
          );
        }}
      </Match>
      <Match when={props.state().status !== "ready"}>
        <button
          type="button"
          data-testid="trade-confirmation"
          data-status={statusKey(props.state())}
          data-anim={props.anim}
          onClick={props.onDismiss}
          class={styles.overlay}
        >
          <ConfirmationContent state={props.state} />
        </button>
      </Match>
    </Switch>
  );
}

interface TileConfirmationProps {
  state: Accessor<TileExecutionState>;
  onDismiss: () => void;
  anim?: "fill" | "reject";
}

interface ConfirmationContentProps {
  state: Accessor<TileExecutionState>;
}

function ConfirmationContent(props: ConfirmationContentProps): JSX.Element {
  // executionStatus only exists on the "finished" branch of the state union;
  // TypeScript can't narrow across two separate `props.state()` calls (each
  // read is independent), so the finished sub-status is read once here and
  // reused by the three finished-branch Matches below.
  const finishedStatus = createMemo((): ExecutionStatus | undefined => {
    const state = props.state();
    return state.status === "finished" ? state.executionStatus : undefined;
  });

  return (
    <Switch>
      {/* PROTO parity: a spinning ring + monospace EXECUTING… label on a
       * dimmed panel, not bare text. */}
      <Match when={props.state().status === "started"}>
        <div class={styles.spinner} />
        <div class={styles.busyLabel}>EXECUTING…</div>
      </Match>
      <Match when={props.state().status === "tooLong"}>
        <span>Trade execution taking longer than expected</span>
      </Match>
      <Match when={props.state().status === "timeout"}>
        <span>Trade execution timed out</span>
      </Match>
      <Match when={finishedStatus() === ExecutionStatus.Rejected}>
        <span>Your trade has been rejected</span>
      </Match>
      <Match when={finishedStatus() === ExecutionStatus.Timeout}>
        <span>Trade execution timed out</span>
      </Match>
      <Match when={finishedStatus() === ExecutionStatus.CreditExceeded}>
        <span>Credit limit exceeded</span>
      </Match>
    </Switch>
  );
}

interface DoneBodyProps {
  trade: Trade;
  onDismiss: () => void;
}

function DoneBody(props: DoneBodyProps): JSX.Element {
  const verb = createMemo((): string => {
    return props.trade.direction === Direction.Buy ? "You Bought" : "You Sold";
  });

  return (
    <>
      <div class={styles.iconSuccess}>✓</div>
      <div class={styles.doneTitle}>{verb()}</div>
      <div class={styles.doneSub}>
        {props.trade.dealtCurrency} {formatNotional(props.trade.notional)}
      </div>
      <div class={styles.detailRow}>
        <DetailCell label="RATE" value={formatRate(props.trade.spotRate)} />
        <DetailCell
          label="SPT"
          value={formatSpotDate(new Date(props.trade.valueDate), 0)}
        />
        <DetailCell label="ID" value={String(props.trade.tradeId)} />
      </div>
      <button
        type="button"
        class={styles.dismiss}
        data-action="dismiss"
        onClick={props.onDismiss}
      >
        DISMISS
      </button>
    </>
  );
}

interface DetailCellProps {
  label: string;
  value: string;
}

function DetailCell(props: DetailCellProps): JSX.Element {
  return (
    <div class={styles.detailCell}>
      <div class={styles.detailLabel}>{props.label}</div>
      <div class={styles.detailValue}>{props.value}</div>
    </div>
  );
}

function formatNotional(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// 6 significant digits, matching the blotter's rate column (blotterColumns.ts
// formatRate) — kept as a small local duplicate rather than a shared import,
// following this file's existing formatNotional precedent.
function formatRate(rate: number): string {
  return rate.toPrecision(6);
}

type ConfirmationStatus =
  | "started"
  | "tooLong"
  | "timeout"
  | "done"
  | "rejected"
  | "timedOut"
  | "creditExceeded"
  | "unknown";

// Semantic state name for the overlay. The stylesheet owns the appearance
// (background colour per status, cursor); the contract Page Object maps this
// status back to the colour token it asserts. Keeping the data-* hook semantic
// (not a colour string) is what lets the markup + CSS port verbatim to another
// View framework.
function statusKey(state: TileExecutionState): ConfirmationStatus {
  if (state.status === "finished") {
    switch (state.executionStatus) {
      case ExecutionStatus.Done:
        return "done";
      case ExecutionStatus.Rejected:
        return "rejected";
      case ExecutionStatus.Timeout:
        return "timedOut";
      case ExecutionStatus.CreditExceeded:
        return "creditExceeded";
      default:
        return "unknown";
    }
  }

  if (state.status === "ready") {
    return "unknown";
  }

  return state.status; // "started" | "tooLong" | "timeout"
}
