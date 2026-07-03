import type { ChangeEvent, ReactElement } from "react";

import { ActivityView } from "#/fx/Blotter/ActivityView";
import styles from "#/fx/Blotter/FxBlotterPanel.module.css";
import { TradesBlotter } from "#/fx/Blotter/TradesBlotter";
import type { ActivityEvent } from "#/fx/types";
import type { BlotterApi } from "#/fx/useFxBlotter";

export interface FxBlotterPanelProps {
  api: BlotterApi;
  activity: ActivityEvent[];
  view: "blotter" | "activity";
  newRowId?: number | null;
}

export interface FxBlotterHeadControlsProps {
  api: BlotterApi;
  view: "blotter" | "activity";
  onView(v: "blotter" | "activity"): void;
}

// PROTO 469-479 (panBlot head): the Blotter/Activity tabs, plus (blotter
// view only) the row count, a filter input, and a CSV export button.
// Rendered as Panel's `headControls` instead of a second head bar.
export function FxBlotterHeadControls(
  props: FxBlotterHeadControlsProps,
): ReactElement {
  const { api, view, onView } = props;

  function handleQuery(e: ChangeEvent<HTMLInputElement>): void {
    api.onQuery(e.target.value);
  }

  function showBlotter(): void {
    onView("blotter");
  }

  function showActivity(): void {
    onView("activity");
  }

  return (
    <>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "blotter")}
        onClick={showBlotter}
      >
        ▤ FX Blotter
      </button>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "activity")}
        onClick={showActivity}
      >
        ⚡ Activity
      </button>
      <div className={styles.spacer} />
      {view === "blotter" ? (
        <div className={styles.tools}>
          <span className={styles.count}>{api.count}</span>
          <input
            className={styles.filter}
            value={api.query}
            onChange={handleQuery}
            placeholder="Filter…"
          />
          <button
            type="button"
            className={styles.csvBtn}
            onClick={api.onExport}
          >
            ⤓ CSV
          </button>
        </div>
      ) : null}
    </>
  );
}

// PROTO 469-497 (panBlot body): swaps between the sortable trades table and
// the activity feed.
export function FxBlotterPanel(props: FxBlotterPanelProps): ReactElement {
  const { api, activity, view, newRowId } = props;

  return (
    <div className={styles.body}>
      {view === "blotter" ? (
        <TradesBlotter api={api} newRowId={newRowId} />
      ) : (
        <ActivityView events={activity} />
      )}
    </div>
  );
}
