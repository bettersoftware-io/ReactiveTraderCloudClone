import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { SessionInfo } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./SessionsPanel.module.css";

/**
 * Active trader sessions — one row per session. Pure list render from
 * `useSessions()`; no local state.
 */
export function SessionsPanel(): JSX.Element {
  const { useSessions } = useViewModel();
  const sessions = useSessions();

  return (
    <div data-testid="admin-sessions" class={styles.panel}>
      <div class={styles.head}>
        <span class={styles.label}>SESSIONS</span>
        <span class={styles.count}>{sessions().length}</span>
      </div>
      <Show
        when={sessions().length > 0}
        fallback={<div class={styles.empty}>NO ACTIVE SESSIONS</div>}
      >
        <ul class={styles.list}>
          <For each={sessions()}>
            {(s: SessionInfo) => {
              return (
                <li class={styles.row}>
                  <span class={styles.user}>{s.user}</span>
                  <span class={styles.region}>{s.region}</span>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}
