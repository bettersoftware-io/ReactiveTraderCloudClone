import { useAnalytics } from "./hooks/use-analytics";
import { PnlChart } from "./pnl-chart";
import { PnlValue } from "./pnl-value";
import { PositionBubbles } from "./position-bubbles";
import { PairPnlBars } from "./pair-pnl-bars";
import { StaleIndicator } from "../stale/stale-indicator";
import { useStaleDetection } from "../stale/use-stale-detection";

export function AnalyticsPanel() {
  const { data, version } = useAnalytics();
  const stale = useStaleDetection(version);

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
