import type { ReactElement } from "react";
import { useRef } from "react";

import type { EqSym, WlSort } from "#/equities/types";
import styles from "#/equities/Watchlist/WatchlistPanel.module.css";
import { WatchlistRow } from "#/equities/Watchlist/WatchlistRow";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

const SORT_LABEL: Record<WlSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};

export interface WatchlistPanelProps {
  rows: WatchRowVm[];
  wlSort: WlSort;
  onSelect(sym: EqSym): void;
  onCycleSort(): void;
}

// PROTO L670-674: the watchlist body — a control sub-head (sort-cycle + a
// decorative ⊕; the outer dock Panel owns the maximize glyph), then the rows.
// Rows glide by rank delta on re-sort (FLIP keyed on data-watch-sym), matching
// the FX live-rates / credit RFQ glide; disabled under reduced motion.
export function WatchlistPanel(props: WatchlistPanelProps): ReactElement {
  const { rows, wlSort, onSelect, onCycleSort } = props;
  const { prefs } = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const flipKey = rows
    .map((r) => {
      return r.sym;
    })
    .join(",");

  useFlip(listRef, flipKey, { reduce: prefs.reduceMotion });

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <button type="button" className={styles.sortBtn} onClick={onCycleSort}>
          <span aria-hidden="true">⇅ </span>
          <span>{SORT_LABEL[wlSort]}</span>
        </button>
        <span className={styles.add} aria-hidden="true">
          ⊕
        </span>
      </div>
      <div className={styles.list} ref={listRef}>
        {rows.map((row) => {
          return (
            <div key={row.sym} data-flip-key={row.sym}>
              <WatchlistRow row={row} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
