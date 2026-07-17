import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { LogEvent, Severity } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./LiveEventLog.module.css";

/**
 * Live event feed — a count header over a scrollable, newest-first log.
 * Ported chrome from PROTO Events/LiveEvents.tsx: head "LIVE EVENTS" + "{n}
 * events" count, each row a time + severity chip (data-sev, uppercase) +
 * service + message. Pure render from useEventLog() — no timers, no local
 * state.
 */
export function LiveEventLog(): JSX.Element {
  const { useEventLog } = useViewModel();
  const events = useEventLog();

  return (
    <div data-testid="admin-event-log" class={styles.card}>
      <div class={styles.head}>
        <span class={styles.title}>LIVE EVENTS</span>
        <span class={styles.count}>{events().length} events</span>
      </div>
      <Show
        when={events().length > 0}
        fallback={<div class={styles.empty}>NO EVENTS</div>}
      >
        <div class={styles.list}>
          <For each={events()}>
            {(e: LogEvent) => {
              const sev = SEVERITY_LABEL[e.severity];
              return (
                <div class={styles.row}>
                  <span class={styles.time}>{clock(e.t)}</span>
                  <span class={styles.sev} data-sev={sev}>
                    {sev}
                  </span>
                  <span class={styles.svc}>{e.service}</span>
                  <span class={styles.msg}>{e.message}</span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
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
