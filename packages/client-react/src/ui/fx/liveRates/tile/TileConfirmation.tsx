import type { ReactElement } from "react";

import type { TileExecutionState } from "@rtc/client-core";
import { Direction, ExecutionStatus, type Trade } from "@rtc/domain";

import { formatSpotDate } from "./formatSpotDate";

import styles from "./TileConfirmation.module.css";

export function TileConfirmation({
  state,
  onDismiss,
  anim,
}: TileConfirmationProps): ReactElement | null {
  if (state.status === "ready") {
    return null;
  }

  if (state.status === "started") {
    return (
      <div
        data-testid="trade-confirmation"
        data-status={statusKey(state)}
        data-anim={anim}
        className={styles.overlay}
      >
        <ConfirmationContent state={state} />
      </div>
    );
  }

  // PROTO parity: the completed-trade confirmation is a dedicated card (icon,
  // verb, dealt line, RATE/SPT/ID row, a DISMISS chip) that only the DISMISS
  // button dismisses — unlike the other statuses below, where the whole
  // overlay is a click-anywhere-to-dismiss button.
  if (
    state.status === "finished" &&
    state.executionStatus === ExecutionStatus.Done &&
    state.trade
  ) {
    return (
      <div
        data-testid="trade-confirmation"
        data-status={statusKey(state)}
        data-anim={anim}
        className={styles.overlay}
      >
        <DoneBody trade={state.trade} onDismiss={onDismiss} />
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="trade-confirmation"
      data-status={statusKey(state)}
      data-anim={anim}
      onClick={onDismiss}
      className={styles.overlay}
    >
      <ConfirmationContent state={state} />
    </button>
  );
}

interface TileConfirmationProps {
  state: TileExecutionState;
  onDismiss: () => void;
  anim?: "fill" | "reject";
}

interface ConfirmationContentProps {
  state: TileExecutionState;
}

function ConfirmationContent({
  state,
}: ConfirmationContentProps): ReactElement | null {
  if (state.status === "started") {
    return <span>Executing...</span>;
  }

  if (state.status === "tooLong") {
    return <span>Trade execution taking longer than expected</span>;
  }

  if (state.status === "timeout") {
    return <span>Trade execution timed out</span>;
  }

  if (state.status === "finished") {
    const { executionStatus } = state;

    if (executionStatus === ExecutionStatus.Rejected) {
      return <span>Your trade has been rejected</span>;
    }

    if (executionStatus === ExecutionStatus.Timeout) {
      return <span>Trade execution timed out</span>;
    }

    if (executionStatus === ExecutionStatus.CreditExceeded) {
      return <span>Credit limit exceeded</span>;
    }

    // executionStatus === Done: a trade renders via the DoneBody branch in
    // TileConfirmation above; Done without a trade falls through to null.
  }

  return null;
}

interface DoneBodyProps {
  trade: Trade;
  onDismiss: () => void;
}

function DoneBody(props: DoneBodyProps): ReactElement {
  const { trade, onDismiss } = props;
  const verb = trade.direction === Direction.Buy ? "You Bought" : "You Sold";

  return (
    <>
      <div className={styles.iconSuccess}>✓</div>
      <div className={styles.doneTitle}>{verb}</div>
      <div className={styles.doneSub}>
        {trade.dealtCurrency} {formatNotional(trade.notional)}
      </div>
      <div className={styles.detailRow}>
        <DetailCell label="RATE" value={formatRate(trade.spotRate)} />
        <DetailCell
          label="SPT"
          value={formatSpotDate(new Date(trade.valueDate), 0)}
        />
        <DetailCell label="ID" value={String(trade.tradeId)} />
      </div>
      <button
        type="button"
        className={styles.dismiss}
        data-action="dismiss"
        onClick={onDismiss}
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

function DetailCell(props: DetailCellProps): ReactElement {
  const { label, value } = props;

  return (
    <div className={styles.detailCell}>
      <div className={styles.detailLabel}>{label}</div>
      <div className={styles.detailValue}>{value}</div>
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
