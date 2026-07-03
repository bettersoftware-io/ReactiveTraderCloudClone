import type { CSSProperties, ReactElement } from "react";

import { netExposureByCurrency } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import styles from "./PositionsPanel.module.css";

export function PositionsPanel(): ReactElement | null {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  if (!data) {
    return <div className={styles.loading}>Loading positions...</div>;
  }

  const exposures = netExposureByCurrency(data.currentPositions);

  return (
    <StaleIndicator stale={stale}>
      <div data-testid="positions-panel" className={styles.panel}>
        <span className={styles.sectionLabel}>Net Exposure</span>
        <div className={styles.cluster}>
          {exposures.map((e) => {
            const size = bubbleSize(e.amountMillions);
            return (
              <span
                key={e.currency}
                data-testid={`exposure-bubble-${e.currency}`}
                data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                className={styles.bubble}
                style={
                  // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
                  {
                    "--bubble-size": `${size}px`,
                    "--bubble-label-size": size > 62 ? "15px" : "12px",
                  } as CSSProperties
                }
              >
                <span className={styles.bubbleRing} aria-hidden="true" />
                <span className={styles.bubbleCcy}>{e.currency}</span>
                <span className={styles.bubbleAmt}>
                  {formatMillions(e.amountMillions)}
                </span>
              </span>
            );
          })}
        </div>
        <div className={styles.ladder}>
          {exposures.map((e) => {
            return (
              <div
                key={e.currency}
                data-testid={`exposure-row-${e.currency}`}
                className={styles.ladderRow}
              >
                <span className={styles.ladderCcy}>{e.currency}</span>
                <span
                  data-sign={e.amountMillions >= 0 ? "pos" : "neg"}
                  className={styles.ladderAmt}
                >
                  {formatMillions(e.amountMillions)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </StaleIndicator>
  );
}

/** PROTO bubble diameter (dc.html L1301): 40 + sqrt(|millions|) * 11. */
function bubbleSize(amountMillions: number): number {
  return Math.round(40 + Math.sqrt(Math.abs(amountMillions)) * 11);
}

function formatMillions(amountMillions: number): string {
  return `${amountMillions > 0 ? "+" : ""}${amountMillions.toFixed(1)}M`;
}
