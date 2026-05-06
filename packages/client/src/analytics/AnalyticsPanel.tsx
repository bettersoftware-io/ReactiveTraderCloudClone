import { useHooks } from "../app/HooksProvider";
import { PnlChart } from "./PnlChart";
import { PnlValue } from "./PnlValue";
import { PositionBubbles } from "./PositionBubbles";
import { PairPnlBars } from "./PairPnlBars";
import { StaleIndicator } from "../stale/StaleIndicator";
import { useStaleDetection } from "../stale/useStaleDetection";

export function AnalyticsPanel() {
  const data = useHooks().useAnalytics();
  const stale = useStaleDetection(data);

  if (!data) {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-tile)",
          border: "1px solid var(--border-primary)",
          borderRadius: 6,
          padding: 16,
          color: "var(--text-muted)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        Loading analytics...
      </div>
    );
  }

  const latestPnl =
    data.history.length > 0
      ? data.history[data.history.length - 1].usdPnl
      : 0;

  return (
    <StaleIndicator stale={stale}>
    <div
      data-testid="analytics-panel"
      style={{
        backgroundColor: "var(--bg-tile)",
        border: "1px solid var(--border-primary)",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 280,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        Analytics
      </span>

      <div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Profit &amp; Loss
        </span>
        <PnlValue value={latestPnl} />
        <PnlChart history={data.history} />
      </div>

      <div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Positions
        </span>
        <PositionBubbles positions={data.currentPositions} />
      </div>

      <div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          PnL per Currency Pair
        </span>
        <PairPnlBars positions={data.currentPositions} />
      </div>
    </div>
    </StaleIndicator>
  );
}
