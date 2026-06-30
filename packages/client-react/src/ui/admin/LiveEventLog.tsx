import type { ReactElement } from "react";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./LiveEventLog.module.css";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// HH:MM:SS from the event timestamp — pure, locale-stable formatting.
function clock(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Newest-first scrolling event log. Each row carries `data-severity` so the CSS
 * paints info/warn/error without className toggling. Pure render from
 * `useEventLog()` — no timers, no local state.
 */
export function LiveEventLog(): ReactElement {
  const { useEventLog } = useViewModel();
  const events = useEventLog();

  return (
    <div data-testid="admin-event-log" className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.label}>EVENT LOG</span>
      </div>
      {events.length === 0 ? (
        <div className={styles.empty}>NO EVENTS</div>
      ) : (
        <ul className={styles.list}>
          {events.map((e) => {
            return (
              <li
                key={`${e.t}-${e.service}-${e.message}`}
                data-severity={e.severity}
                className={styles.row}
              >
                <span className={styles.time}>{clock(e.t)}</span>
                <span className={styles.service}>{e.service}</span>
                <span className={styles.message}>{e.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
