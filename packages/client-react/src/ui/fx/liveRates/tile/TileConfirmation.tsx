import { Direction, ExecutionStatus } from "@rtc/domain";

import type { TileExecutionState } from "../../../../app/presenters/TileExecutionMachine";

import styles from "./TileConfirmation.module.css";

interface TileConfirmationProps {
  state: TileExecutionState;
  onDismiss: () => void;
}

function formatNotional(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function ConfirmationContent({ state }: { state: TileExecutionState }) {
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
    const { executionStatus, trade } = state;

    if (executionStatus === ExecutionStatus.Rejected) {
      return <span>Your trade has been rejected</span>;
    }

    if (executionStatus === ExecutionStatus.Timeout) {
      return <span>Trade execution timed out</span>;
    }

    if (executionStatus === ExecutionStatus.CreditExceeded) {
      return <span>Credit limit exceeded</span>;
    }

    if (executionStatus === ExecutionStatus.Done && trade) {
      const verb =
        trade.direction === Direction.Buy ? "You Bought" : "You Sold";
      return (
        <div className={styles.tradeDetails}>
          <span className={styles.tradeVerb}>{verb}</span>
          <span>
            {trade.dealtCurrency} {formatNotional(trade.notional)}
          </span>
          <span className={styles.tradeMeta}>
            {trade.currencyPair} @ {trade.spotRate}
          </span>
          <span className={styles.tradeId}>
            Trade ID: {trade.tradeId} | {trade.valueDate}
          </span>
        </div>
      );
    }
  }

  return null;
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
  if (state.status === "ready") return "unknown";
  return state.status; // "started" | "tooLong" | "timeout"
}

export function TileConfirmation({ state, onDismiss }: TileConfirmationProps) {
  if (state.status === "ready") return null;

  if (state.status === "started") {
    return (
      <div
        data-testid="trade-confirmation"
        data-status={statusKey(state)}
        className={styles.overlay}
      >
        <ConfirmationContent state={state} />
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="trade-confirmation"
      data-status={statusKey(state)}
      onClick={onDismiss}
      className={styles.overlay}
    >
      <ConfirmationContent state={state} />
    </button>
  );
}
