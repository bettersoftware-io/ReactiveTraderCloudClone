import type { ReactElement } from "react";

import styles from "#/fx/Analytics/PnlSummary.module.css";
import { fmtPnl } from "#/fx/Analytics/analyticsData";
import { PnlSparkline } from "#/fx/Analytics/PnlSparkline";

export interface PnlSummaryProps {
  pnl: number;
}

// PROTO 506-509: "Profit & Loss · Today" label, the big glowing figure
// (color by sign), and the static sparkline.
export function PnlSummary(props: PnlSummaryProps): ReactElement {
  const { pnl } = props;
  const sign = pnl >= 0 ? "pos" : "neg";

  return (
    <div>
      <div className={styles.label}>Profit &amp; Loss · Today</div>
      <div className={styles.value} data-sign={sign}>
        {fmtPnl(pnl)}
      </div>
      <PnlSparkline />
    </div>
  );
}
