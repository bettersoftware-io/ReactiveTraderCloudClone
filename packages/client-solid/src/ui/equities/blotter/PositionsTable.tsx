import { createMemo, For, type JSX, Show } from "solid-js";

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
export function PositionsTable(props: PositionsTableProps): JSX.Element {
  const maxAbsPnl = createMemo((): number => {
    return Math.max(
      ...props.positions.map((position) => {
        return Math.abs(position.unrealisedPnl);
      }),
      1,
    );
  });

  return (
    <div class={styles.body}>
      <div class={styles.gaugeCard}>
        <DeskPnlGauge positions={props.positions} />
      </div>

      <Show
        when={props.positions.length > 0}
        fallback={<div class={styles.empty}>No open positions</div>}
      >
        <div class={styles.table}>
          <div class={styles.headerRow}>
            <For each={HEADERS}>
              {(header: string): JSX.Element => {
                return <span>{header}</span>;
              }}
            </For>
          </div>
          <For each={props.positions}>
            {(position: EquityPosition): JSX.Element => {
              return (
                <PositionsRow position={position} maxAbsPnl={maxAbsPnl()} />
              );
            }}
          </For>
        </div>
      </Show>
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

function PositionsRow(props: PositionsRowProps): JSX.Element {
  const mv = createMemo((): number => {
    return props.position.qty * props.position.markPrice;
  });

  const isPositive = createMemo((): boolean => {
    return props.position.unrealisedPnl >= 0;
  });

  const plColor = createMemo((): string => {
    return isPositive() ? "var(--accent-positive)" : "var(--accent-negative)";
  });

  const plText = createMemo((): string => {
    return `${isPositive() ? "+" : "-"}$${fmtNum(Math.abs(props.position.unrealisedPnl))}`;
  });

  return (
    <div
      data-testid={`position-row-${props.position.symbol}`}
      data-pnl={isPositive() ? "pos" : "neg"}
      class={styles.row}
    >
      <span class={styles.sym}>{props.position.symbol}</span>
      <span>{fmtNum(props.position.qty)}</span>
      <span class={styles.dim}>${props.position.avgPrice.toFixed(2)}</span>
      <span>${props.position.markPrice.toFixed(2)}</span>
      <span>${fmtNum(mv())}</span>
      <span class={styles.plCell}>
        <span
          class={styles.pl}
          // eslint-disable-next-line no-restricted-syntax -- runtime P/L sign colour via CSS custom property; static CSS can't express it
          style={{ "--pl": plColor() }}
        >
          {plText()}
        </span>
        <PnlSparkline
          pnl={props.position.unrealisedPnl}
          maxAbsPnl={props.maxAbsPnl}
        />
      </span>
    </div>
  );
}

// Mirrors the prototype's fmtNum (Ticket/OrderTicketPanel.tsx, positionsVm.ts).
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
