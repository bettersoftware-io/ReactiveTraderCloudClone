import type { ReactElement } from "react";

import type { EqSym } from "#/equities/types";
import styles from "#/equities/Watchlist/WatchlistRow.module.css";
import type { WatchRowVm } from "#/equities/watchlistVm";

export interface WatchlistRowProps {
  row: WatchRowVm;
  onSelect(sym: EqSym): void;
}

// PROTO L672: one watchlist row — symbol + name on the left, last + %-change
// on the right; selected/flash/direction are all `data-*` hooks.
export function WatchlistRow(props: WatchlistRowProps): ReactElement {
  const { row, onSelect } = props;

  function handleClick(): void {
    onSelect(row.sym);
  }

  return (
    <button
      type="button"
      className={styles.row}
      data-watch-sym={row.sym}
      data-selected={String(row.selected)}
      data-flash={String(row.flashOn)}
      data-up={String(row.up)}
      onClick={handleClick}
    >
      <span className={styles.left}>
        <span className={styles.sym}>{row.sym}</span>
        <span className={styles.name}>{row.name}</span>
      </span>
      <span className={styles.right}>
        <span className={styles.last} data-up={String(row.up)}>
          {row.last}
        </span>
        <span className={styles.chg} data-up={String(row.up)}>
          {row.chg}
        </span>
      </span>
    </button>
  );
}
