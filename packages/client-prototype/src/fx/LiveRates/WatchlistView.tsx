import type { CSSProperties, ReactElement } from "react";

import { Sparkline } from "#/fx/LiveRates/Sparkline";
import styles from "#/fx/LiveRates/WatchlistView.module.css";
import type { Sym } from "#/fx/types";

export interface WatchRow {
  sym: Sym;
  mid: string;
  movePips: number;
  moveUp: boolean;
  spread: string;
  hist: number[];
}

export interface WatchlistViewProps {
  rows: WatchRow[];
}

// PROTO 454-470: the compact Watchlist table — a header row
// (Pair | Mid | Move | Spread | Trend) over a fixed 5-column grid, then one
// row per pair reusing the same grid, a move-colored mid/move pair, and a
// mini Sparkline in the Trend column.
export function WatchlistView(props: WatchlistViewProps): ReactElement {
  const { rows } = props;

  return (
    <div>
      <div className={styles.header}>
        <span>Pair</span>
        <span>Mid</span>
        <span>Move</span>
        <span>Spread</span>
        <span>Trend</span>
      </div>
      {rows.map((row) => {
        return <WatchRowCell key={row.sym} row={row} />;
      })}
    </div>
  );
}

interface WatchRowCellProps {
  row: WatchRow;
}

function WatchRowCell(props: WatchRowCellProps): ReactElement {
  const { row } = props;
  const moveColor = {
    "--move-color": row.moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <div data-tile-sym={row.sym} className={styles.row}>
      <span className={styles.pair}>{row.sym}</span>
      <span className={styles.mid} style={moveColor}>
        {row.mid}
      </span>
      <span className={styles.move} style={moveColor}>
        {row.moveUp ? "▲" : "▼"} {row.movePips}
      </span>
      <span className={styles.spread}>{row.spread}</span>
      <div className={styles.trend}>
        <Sparkline hist={row.hist} mini moveUp={row.moveUp} />
      </div>
    </div>
  );
}
