import { createMemo, For, type JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./InstrumentTabs.module.css";

/**
 * Open-instrument tab strip — reads/writes the shared eqWorkspace machine
 * directly (openTabs/sel/select/closeTab), rather than being threaded a
 * selection via props: the tabs, chart, and watchlist panels are independent
 * engine cells that all read/write this one shared source of truth. Each tab
 * carries a close affordance whose click stops propagation so it never also
 * fires the tab's own select.
 */
export function InstrumentTabs(): JSX.Element {
  const { useEqWorkspace } = useViewModel();
  const { state, select, closeTab } = useEqWorkspace();

  return (
    <nav class={styles.tabs} aria-label="Instrument tabs">
      <For each={state().openTabs}>
        {(symbol: string): JSX.Element => {
          // Reactive per-item lookup (not a frozen `const`): `<For>` only
          // re-invokes this callback when the openTabs array itself changes
          // (a tab opened/closed), never for a plain selection change — so
          // `active` must be tracked live via `createMemo`.
          const active = createMemo((): boolean => {
            return symbol === state().sel;
          });

          return (
            <button
              type="button"
              data-active={active() ? "true" : "false"}
              data-testid={`instrument-tab-${symbol}`}
              class={styles.tab}
              onClick={() => {
                select(symbol);
              }}
            >
              {symbol}
              <span
                class={styles.close}
                aria-hidden="true"
                onClick={(event: MouseEvent) => {
                  event.stopPropagation();
                  closeTab(symbol);
                }}
              >
                ✕
              </span>
            </button>
          );
        }}
      </For>
    </nav>
  );
}
