import type { ReactElement } from "react";
import { useRef } from "react";

import type { EqSym, WlSort } from "#/equities/types";
import { useRankGlide } from "#/equities/Watchlist/useRankGlide";
import styles from "#/equities/Watchlist/WatchlistPanel.module.css";
import { WatchlistRow } from "#/equities/Watchlist/WatchlistRow";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { usePreferences } from "#/shell/Preferences/usePreferences";

const SORT_LABEL: Record<WlSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};

export interface WatchlistPanelControlsProps {
  wlSort: WlSort;
  onCycleSort(): void;
}

// PROTO L670-671: the watchlist's control row — sort-cycle + a decorative ⊕
// — hoisted out of the body so the dock Panel's headControls renders it
// inline in the single head bar.
export function WatchlistPanelControls(
  props: WatchlistPanelControlsProps,
): ReactElement {
  const { wlSort, onCycleSort } = props;

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.sortBtn} onClick={onCycleSort}>
        <span aria-hidden="true">⇅ </span>
        <span>{SORT_LABEL[wlSort]}</span>
      </button>
      <span className={styles.add} aria-hidden="true">
        ⊕
      </span>
    </div>
  );
}

export interface WatchlistPanelProps {
  rows: WatchRowVm[];
  onSelect(sym: EqSym): void;
}

// PROTO L672-674, L879-892: the watchlist body — the rows. (The control row
// is WatchlistPanelControls, rendered by the dock Panel's headControls.) Rows
// glide by RANK delta on re-sort with a direction-colored highlight pulse
// (green rose / red fell) — see useRankGlide; disabled under reduced motion.
export function WatchlistPanel(props: WatchlistPanelProps): ReactElement {
  const { rows, onSelect } = props;
  const { prefs } = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const order = rows.map((r) => {
    return r.sym;
  });

  useRankGlide(listRef, order, prefs.reduceMotion);

  return (
    <div className={styles.body}>
      <div className={styles.list} ref={listRef}>
        {rows.map((row) => {
          return <WatchlistRow key={row.sym} row={row} onSelect={onSelect} />;
        })}
      </div>
    </div>
  );
}
