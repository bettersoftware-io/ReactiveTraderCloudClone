// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { ReactElement } from "react";
import { useState } from "react";

import styles from "./HeaderChrome.module.css";

/** Static notification seed (prototype Reactive Trader.dc.html:774-778). There
 *  is no real alert stream (Non-goals: no real backend), so these are fixed,
 *  decorative rows — the menu opens/closes purely as local view state. */
const NOTIF_SEED = [
  {
    t: "09:46",
    tag: "LIMIT",
    msg: "EURUSD position at 80% of desk limit",
    tone: "accent" as const,
  },
  {
    t: "09:41",
    tag: "NEWS",
    msg: "ECB rate decision in 25 minutes",
    tone: "accent2" as const,
  },
  {
    t: "09:38",
    tag: "SETTLE",
    msg: "2 trades settle today · value 25-Jun",
    tone: "positive" as const,
  },
];

export function NotificationsMenu(): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        data-testid="notifications-toggle"
        aria-label="Notifications"
        aria-expanded={open}
        className={styles.iconButton}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.bellIcon}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span className={styles.badge}>{NOTIF_SEED.length}</span>
      </button>
      {open ? (
        <div
          data-testid="notifications-panel"
          className={styles.dropdown}
          role="menu"
        >
          <div className={styles.dropdownHead}>
            <span className={styles.dropdownTitle}>NOTIFICATIONS</span>
            <span className={styles.dropdownMeta}>{NOTIF_SEED.length} new</span>
          </div>
          <ul className={styles.notifList}>
            {NOTIF_SEED.map((n) => {
              return (
                <li key={n.tag} className={styles.notifRow}>
                  <span className={styles.notifTag} data-tone={n.tone}>
                    {n.tag}
                  </span>
                  <span className={styles.notifBody}>
                    <span className={styles.notifMsg}>{n.msg}</span>
                    <span className={styles.notifTime}>{n.t}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
