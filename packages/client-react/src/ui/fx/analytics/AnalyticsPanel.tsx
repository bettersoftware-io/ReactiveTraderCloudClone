import { useHooks } from "#/ui/hooks/useHooks";
import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { PairPnlBars } from "./PairPnlBars";
import { PnlChart } from "./PnlChart";
import { PnlValue } from "./PnlValue";
import { PositionBubbles } from "./PositionBubbles";

import styles from "./AnalyticsPanel.module.css";

export function AnalyticsPanel() {
  const data = useHooks().useAnalytics();
  const stale = useHooks().useAnalyticsStaleFlag();

  if (!data) {
    return <div className={styles.loading}>Loading analytics...</div>;
  }

  const latestPnl =
    data.history.length > 0 ? data.history[data.history.length - 1].usdPnl : 0;

  return (
    <StaleIndicator stale={stale}>
      <div data-testid="analytics-panel" className={styles.panel}>
        <span className={styles.title}>Analytics</span>

        <div>
          <span className={styles.sectionLabel}>Profit &amp; Loss</span>
          <PnlValue value={latestPnl} />
          <PnlChart history={data.history} />
        </div>

        <div>
          <span className={styles.sectionLabel}>Positions</span>
          <PositionBubbles positions={data.currentPositions} />
        </div>

        <div>
          <span className={styles.sectionLabel}>PnL per Currency Pair</span>
          <PairPnlBars positions={data.currentPositions} />
        </div>
      </div>
    </StaleIndicator>
  );
}
