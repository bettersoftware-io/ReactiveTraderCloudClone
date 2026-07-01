import type { ReactElement } from "react";

import { BlotterRow } from "#/fx/Blotter/BlotterRow";
import styles from "#/fx/Blotter/TradesBlotter.module.css";
import type { BlotterApi } from "#/fx/useFxBlotter";

export interface TradesBlotterProps {
  api: BlotterApi;
}

// PROTO 475-492 (the blotter table) + 1306/1308 (column defs + grid
// template): a sortable header row — each column a clickable header cell
// showing `label + ind` — over the 10-col FX blotter grid, then one
// BlotterRow per filtered/sorted trade.
//
// `isNew` always renders false here: this component only receives `api`, not
// a `newRowId`. A later phase (Task 8/10) threads `newRowId` through so the
// row matching the just-booked trade can flash in.
export function TradesBlotter(props: TradesBlotterProps): ReactElement {
  const { api } = props;

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
        return <BlotterRow key={trade.id} trade={trade} isNew={false} />;
      })}
    </div>
  );
}
