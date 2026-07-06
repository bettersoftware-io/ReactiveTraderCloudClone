import type { CSSProperties, ReactElement } from "react";

import type { EquityPosition } from "@rtc/domain";

import { DeskPnlGauge } from "./DeskPnlGauge";
import { PnlSparkline } from "./PnlSparkline";

import styles from "./PositionsTable.module.css";

/**
 * The equities Positions blotter body — a desk P&L gauge card over a sticky
 * 6-column table, one row per `useEquityPositions()` position. Ported from
 * client-prototype's PositionsTable/positionsVm, adapted onto the real
 * EquityPosition numerics (mv = qty × markPrice; positionsVm's cost-basis
 * derivation isn't needed here since avgPrice/markPrice/unrealisedPnl already
 * come from the port). DeskPnlGauge + a per-row PnlSparkline are kept inline
 * in the P/L cell — a capability-showcase addition beyond the prototype's
 * plain 6 columns, per the parity-D plan.
 */
export function PositionsTable({
  positions,
}: PositionsTableProps): ReactElement {
  const maxAbsPnl = Math.max(
    ...positions.map((position) => {
      return Math.abs(position.unrealisedPnl);
    }),
    1,
  );

  return (
    <div className={styles.body}>
      <div className={styles.gaugeCard}>
        <DeskPnlGauge positions={positions} />
      </div>

      {positions.length === 0 ? (
        <div className={styles.empty}>No open positions</div>
      ) : (
        <div className={styles.table}>
          <div className={styles.headerRow}>
            {HEADERS.map((header) => {
              return <span key={header}>{header}</span>;
            })}
          </div>
          {positions.map((position) => {
            return (
              <PositionsRow
                key={position.symbol}
                position={position}
                maxAbsPnl={maxAbsPnl}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface PositionsTableProps {
  positions: readonly EquityPosition[];
}

const HEADERS = ["Symbol", "Qty", "Avg Px", "Last", "Mkt Value", "P/L"];

interface PositionsRowProps {
  position: EquityPosition;
  maxAbsPnl: number;
}

function PositionsRow({
  position,
  maxAbsPnl,
}: PositionsRowProps): ReactElement {
  const { symbol, qty, avgPrice, markPrice, unrealisedPnl } = position;
  const mv = qty * markPrice;
  const isPositive = unrealisedPnl >= 0;
  const plColor = isPositive
    ? "var(--accent-positive)"
    : "var(--accent-negative)";
  const plText = `${isPositive ? "+" : "-"}$${fmtNum(Math.abs(unrealisedPnl))}`;

  return (
    <div
      data-testid={`position-row-${symbol}`}
      data-pnl={isPositive ? "pos" : "neg"}
      className={styles.row}
    >
      <span className={styles.sym}>{symbol}</span>
      <span>{fmtNum(qty)}</span>
      <span className={styles.dim}>${avgPrice.toFixed(2)}</span>
      <span>${markPrice.toFixed(2)}</span>
      <span>${fmtNum(mv)}</span>
      <span className={styles.plCell}>
        <span
          className={styles.pl}
          // eslint-disable-next-line no-restricted-syntax -- runtime P/L sign colour via CSS custom property; static CSS can't express it
          style={{ "--pl": plColor } as CSSProperties}
        >
          {plText}
        </span>
        <PnlSparkline pnl={unrealisedPnl} maxAbsPnl={maxAbsPnl} />
      </span>
    </div>
  );
}

// Mirrors the prototype's fmtNum (Ticket/OrderTicketPanel.tsx, positionsVm.ts).
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
