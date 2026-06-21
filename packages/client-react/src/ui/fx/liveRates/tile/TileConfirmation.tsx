import { ExecutionStatus, Direction, type Trade } from "@rtc/domain";
import type { TileExecutionState } from "../../../../app/presenters/TileExecutionMachine";
import styles from "./TileConfirmation.module.css";

interface TileConfirmationProps {
  state: TileExecutionState;
  onDismiss: () => void;
}

const bgByStatus: Record<string, string> = {
  started: "transparent",
  tooLong: "var(--accent-aware)",
  timeout: "var(--accent-aware)",
  [ExecutionStatus.Done]: "var(--accent-positive)",
  [ExecutionStatus.Rejected]: "var(--accent-negative)",
  [ExecutionStatus.Timeout]: "var(--accent-aware)",
  [ExecutionStatus.CreditExceeded]: "var(--accent-aware)",
};

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

function resolveBg(state: TileExecutionState): string {
  if (state.status === "finished") {
    return bgByStatus[state.executionStatus] ?? "var(--bg-overlay)";
  }
  return bgByStatus[state.status] ?? "var(--bg-overlay)";
}

export function TileConfirmation({ state, onDismiss }: TileConfirmationProps) {
  if (state.status === "ready") return null;

  const bg = resolveBg(state);
  const cursorValue = state.status === "started" ? "default" : "pointer";

  return (
    <div
      data-testid="trade-confirmation"
      data-bg={bg}
      data-cursor={cursorValue}
      onClick={state.status !== "started" ? onDismiss : undefined}
      className={styles.overlay}
      style={{ backgroundColor: bg, cursor: cursorValue }}
    >
      <ConfirmationContent state={state} />
    </div>
  );
}
