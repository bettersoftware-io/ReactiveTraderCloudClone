import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { PairPnlBars } from "./PairPnlBars";
import { PnlChart } from "./PnlChart";
import { PnlValue } from "./PnlValue";

import styles from "./AnalyticsPanel.module.css";

export function AnalyticsPanel(): ReactElement | null {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  if (!data) {
    return <div className={styles.loading}>Loading analytics...</div>;
  }

  const latestPnl =
    data.history.length > 0 ? data.history[data.history.length - 1].usdPnl : 0;

  return (
    <StaleIndicator stale={stale}>
      <div data-testid="analytics-panel" className={styles.panel}>
        <div>
          <span className={styles.sectionLabel}>Profit &amp; Loss · Today</span>
          <PnlValue value={latestPnl} />
          <PnlChart history={data.history} />
        </div>

        <div>
          <span className={styles.sectionLabel}>PnL per Currency Pair</span>
          <PairPnlBars positions={data.currentPositions} />
        </div>
      </div>
    </StaleIndicator>
  );
}
