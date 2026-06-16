import { ExecutionStatus, Direction, type Trade } from "@rtc/domain";
import type { TileExecutionState } from "../../../../app/presenters/TileExecutionMachine";

interface TileConfirmationProps {
  state: TileExecutionState;
  onDismiss: () => void;
}

const bgColors: Record<string, string> = {
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>{verb}</span>
          <span>
            {trade.dealtCurrency} {formatNotional(trade.notional)}
          </span>
          <span style={{ fontSize: 11 }}>
            {trade.currencyPair} @ {trade.spotRate}
          </span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>
            Trade ID: {trade.tradeId} | {trade.valueDate}
          </span>
        </div>
      );
    }
  }

  return null;
}

export function TileConfirmation({ state, onDismiss }: TileConfirmationProps) {
  if (state.status === "ready") return null;

  const bg =
    state.status === "finished"
      ? bgColors[state.executionStatus] ?? "var(--bg-overlay)"
      : bgColors[state.status] ?? "var(--bg-overlay)";

  return (
    <div
      data-testid="trade-confirmation"
      onClick={state.status !== "started" ? onDismiss : undefined}
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        backgroundColor: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 13,
        textAlign: "center",
        padding: 12,
        cursor:
          state.status === "started" ? "default" : "pointer",
        zIndex: 1,
      }}
    >
      <ConfirmationContent state={state} />
    </div>
  );
}
