import type { ReactElement } from "react";

import type { PanelData } from "@rtc/core-api";

import styles from "./panels.module.css";

/** Dumb tone-coloured data table. Pure props-in, paint-out. */
export function PanelTable({ columns, rows }: PanelTableProps): ReactElement {
  if (rows.length === 0) {
    return <div className={styles.empty}>No data yet</div>;
  }

  return (
    <table data-testid="jarvis-panel-table" className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => {
            return (
              <th key={col} className={styles.tableHead}>
                {col}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const rowKey = JSON.stringify(row.cells);
          return (
            <tr key={rowKey} data-tone={row.tone} className={styles.tableRow}>
              {row.cells.map((cell, i) => {
                const col = columns[i] ?? `col-${i}`;
                return (
                  <td key={col} className={styles.tableCell}>
                    <span key={cell} className={styles.flashOnChange}>
                      {cell}
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// A named tag (rather than an inline `{ kind: "table" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// JarvisMachine.ts's `ConfirmRequestTag`).
interface TableKindTag {
  readonly kind: "table";
}
export type PanelTableProps = Extract<PanelData, TableKindTag>;
