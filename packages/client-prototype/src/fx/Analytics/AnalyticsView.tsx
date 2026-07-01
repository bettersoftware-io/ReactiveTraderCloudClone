import type { ReactElement } from "react";

import styles from "#/fx/Analytics/AnalyticsView.module.css";
import { PairPnlBars } from "#/fx/Analytics/PairPnlBars";
import { PnlSummary } from "#/fx/Analytics/PnlSummary";

export interface AnalyticsViewProps {
  pnl: number;
}

// PROTO 505-515: the Analytics panel body — PnL summary over the per-pair bars.
export function AnalyticsView(props: AnalyticsViewProps): ReactElement {
  const { pnl } = props;

  return (
    <div className={styles.body}>
      <PnlSummary pnl={pnl} />
      <PairPnlBars />
    </div>
  );
}
