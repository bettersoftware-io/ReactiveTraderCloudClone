import { createMemo, type JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/**
 * The equities blotter panel's head slot: ▤ Orders / ◴ Positions tabs plus a
 * live row count for whichever view is active — mirrors FxBlotterHead/
 * LiveRatesHead. Drives the shared `useEqBlotterView()` preference so the
 * head and EqBlotterPanel body always agree on the active tab.
 */
export function EqBlotterHead(): JSX.Element {
  const { useEqBlotterView, useEquityOrders, useEquityPositions } =
    useViewModel();
  const { view, setView } = useEqBlotterView();
  const orders = useEquityOrders();
  const positions = useEquityPositions();
  const count = createMemo((): string => {
    return view() === "orders"
      ? `${orders().length} orders`
      : `${positions().length} positions`;
  });

  return (
    <div class={styles.headTabs}>
      <button
        type="button"
        data-testid="blotter-tab-orders"
        data-active={view() === "orders" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setView("orders");
        }}
      >
        ▤ Orders
      </button>
      <button
        type="button"
        data-testid="blotter-tab-positions"
        data-active={view() === "positions" ? "true" : "false"}
        class={styles.headTab}
        onClick={() => {
          setView("positions");
        }}
      >
        ◴ Positions
      </button>
      <span class={styles.headSpacer} />
      <span data-testid="blotter-count" class={styles.count}>
        {count()}
      </span>
    </div>
  );
}
