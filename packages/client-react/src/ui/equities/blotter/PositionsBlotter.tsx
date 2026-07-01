import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { DeskPnlGauge } from "./DeskPnlGauge";
import { PnlSparkline } from "./PnlSparkline";

import styles from "./PositionsBlotter.module.css";

export function PositionsBlotter(): ReactElement {
  const { useEquityPositions } = useViewModel();
  const positions = useEquityPositions();

  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.unrealisedPnl);
    }),
    1,
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.gauge}>
        <DeskPnlGauge positions={positions} />
      </div>

      {positions.length === 0 ? (
        <div className={styles.empty}>NO POSITIONS</div>
      ) : (
        <div className={styles.blotter}>
          <div className={styles.header}>
            <span>SYMBOL</span>
            <span>QTY</span>
            <span>AVG</span>
            <span>MARK</span>
            <span>UPNL</span>
            <span>SPARK</span>
          </div>
          {positions.map((pos) => {
            const pnlSign = pos.unrealisedPnl >= 0 ? "pos" : "neg";
            const pnlDisplay =
              pos.unrealisedPnl >= 0
                ? `+${pos.unrealisedPnl.toFixed(0)}`
                : pos.unrealisedPnl.toFixed(0);

            return (
              <div
                key={pos.symbol}
                data-testid={`position-row-${pos.symbol}`}
                data-pnl={pnlSign}
                className={styles.row}
              >
                <span className={styles.symbol}>{pos.symbol}</span>
                <span className={styles.qty}>{pos.qty.toLocaleString()}</span>
                <span className={styles.avgPrice}>
                  {pos.avgPrice.toFixed(2)}
                </span>
                <span className={styles.markPrice}>
                  {pos.markPrice.toFixed(2)}
                </span>
                <span className={styles.pnl}>{pnlDisplay}</span>
                <div className={styles.sparkCell}>
                  <PnlSparkline pnl={pos.unrealisedPnl} maxAbsPnl={maxAbsPnl} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
