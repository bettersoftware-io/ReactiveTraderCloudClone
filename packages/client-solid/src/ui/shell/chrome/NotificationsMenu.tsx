// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import styles from "./HeaderChrome.module.css";

export function NotificationsMenu(): JSX.Element {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={styles.menuAnchor}>
      <button
        type="button"
        data-testid="notifications-toggle"
        aria-label="Notifications"
        aria-expanded={open()}
        class={styles.iconButton}
        onClick={() => {
          setOpen(!open());
        }}
      >
        <svg
          viewBox="0 0 24 24"
          class={styles.bellIcon}
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span class={styles.badge}>{NOTIF_SEED.length}</span>
      </button>
      <Show when={open()}>
        <div
          data-testid="notifications-panel"
          class={`${styles.dropdown} ${styles.notifDropdown}`}
          role="menu"
        >
          <div class={styles.dropdownHead}>
            <span class={styles.dropdownTitle}>NOTIFICATIONS</span>
            <span class={styles.dropdownMeta}>{NOTIF_SEED.length} new</span>
          </div>
          <ul class={styles.notifList}>
            <For each={NOTIF_SEED}>
              {(n: (typeof NOTIF_SEED)[number]) => {
                return (
                  <li class={styles.notifRow}>
                    <span class={styles.notifTag} data-tone={n.tone}>
                      {n.tag}
                    </span>
                    <span class={styles.notifBody}>
                      <span class={styles.notifMsg}>{n.msg}</span>
                      <span class={styles.notifTime}>{n.t}</span>
                    </span>
                  </li>
                );
              }}
            </For>
          </ul>
          <button
            type="button"
            data-testid="notifications-mark-read"
            class={styles.markRead}
            onClick={() => {
              // Decorative like the prototype: just closes the dropdown.
              setOpen(false);
            }}
          >
            MARK ALL READ
          </button>
        </div>
      </Show>
    </div>
  );
}

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
