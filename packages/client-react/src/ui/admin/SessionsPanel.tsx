import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./SessionsPanel.module.css";

/**
 * Active trader sessions — one row per session. Pure list render from
 * `useSessions()`; no local state.
 */
export function SessionsPanel(): ReactElement {
  const { useSessions } = useViewModel();
  const sessions = useSessions();

  return (
    <div data-testid="admin-sessions" className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.label}>SESSIONS</span>
        <span className={styles.count}>{sessions.length}</span>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.empty}>NO ACTIVE SESSIONS</div>
      ) : (
        <ul className={styles.list}>
          {sessions.map((s) => {
            return (
              <li key={s.id} className={styles.row}>
                <span className={styles.user}>{s.user}</span>
                <span className={styles.region}>{s.region}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
