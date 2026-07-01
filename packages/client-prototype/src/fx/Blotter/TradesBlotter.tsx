import type { ReactElement } from "react";

import { BlotterRow } from "#/fx/Blotter/BlotterRow";
import styles from "#/fx/Blotter/TradesBlotter.module.css";
import type { BlotterApi } from "#/fx/useFxBlotter";

export interface TradesBlotterProps {
  api: BlotterApi;
  newRowId?: number | null;
}

// PROTO 475-492 (the blotter table) + 1306/1308-1309 (column defs + grid
// template + fxTrades map): a sortable header row — each column a clickable
// header cell showing `label + ind` — over the 10-col FX blotter grid, then
// one BlotterRow per filtered/sorted trade. The row whose id matches
// `newRowId` (the just-booked trade, threaded down from FxBlotterPanel) is
// the one that gets `isNew`, so its rowIn/rowFlashA-B entrance animation
// fires.
export function TradesBlotter(props: TradesBlotterProps): ReactElement {
  const { api, newRowId } = props;

  return (
    <div>
      <div className={styles.headerRow}>
        {api.cols.map((col) => {
          return (
            <button
              key={col.field}
              type="button"
              className={styles.headerCell}
              onClick={() => {
                api.onSort(col.field);
              }}
            >
              {col.label}
              {col.ind}
            </button>
          );
        })}
      </div>
      {api.rows.map((trade) => {
        return (
          <BlotterRow
            key={trade.id}
            trade={trade}
            isNew={trade.id === newRowId}
          />
        );
      })}
    </div>
  );
}
