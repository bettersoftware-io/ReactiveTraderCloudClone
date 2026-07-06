import type { ReactElement } from "react";

import type { Severity } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./LiveEventLog.module.css";

/**
 * Live event feed — a count header over a scrollable, newest-first log.
 * Ported chrome from PROTO Events/LiveEvents.tsx: head "LIVE EVENTS" + "{n}
 * events" count, each row a time + severity chip (data-sev, uppercase) +
 * service + message. Pure render from useEventLog() — no timers, no local
 * state.
 */
export function LiveEventLog(): ReactElement {
  const { useEventLog } = useViewModel();
  const events = useEventLog();

  return (
    <div data-testid="admin-event-log" className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LIVE EVENTS</span>
        <span className={styles.count}>{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <div className={styles.empty}>NO EVENTS</div>
      ) : (
        <div className={styles.list}>
          {events.map((e) => {
            const sev = SEVERITY_LABEL[e.severity];
            return (
              <div
                key={`${e.t}-${e.service}-${e.message}`}
                className={styles.row}
              >
                <span className={styles.time}>{clock(e.t)}</span>
                <span className={styles.sev} data-sev={sev}>
                  {sev}
                </span>
                <span className={styles.svc}>{e.service}</span>
                <span className={styles.msg}>{e.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Domain severity ("info"/"warn"/"error") is lowercase; the prototype's chip
// text (and data-sev selector) is uppercase — mapped here, not on the domain.
const SEVERITY_LABEL: Record<Severity, "INFO" | "WARN" | "ERROR"> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// HH:MM:SS from the event timestamp — pure, locale-stable formatting.
function clock(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
