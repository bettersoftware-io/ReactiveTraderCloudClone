import type { MouseEvent, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./InstrumentTabs.module.css";

/**
 * Open-instrument tab strip — reads/writes the shared eqWorkspace machine
 * directly (openTabs/sel/select/closeTab), rather than being threaded a
 * selection via props: the tabs, chart, and watchlist panels are independent
 * engine cells that all read/write this one shared source of truth. Each tab
 * carries a close affordance whose click stops propagation so it never also
 * fires the tab's own select.
 */
export function InstrumentTabs(): ReactElement {
  const { useEqWorkspace } = useViewModel();
  const { state, select, closeTab } = useEqWorkspace();

  return (
    <nav className={styles.tabs} aria-label="Instrument tabs">
      {state.openTabs.map((symbol) => {
        const active = symbol === state.sel;
        return (
          <button
            key={symbol}
            type="button"
            data-active={active ? "true" : "false"}
            data-testid={`instrument-tab-${symbol}`}
            className={styles.tab}
            onClick={() => {
              select(symbol);
            }}
          >
            {symbol}
            <span
              className={styles.close}
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
      })}
    </nav>
  );
}
