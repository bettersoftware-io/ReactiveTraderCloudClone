import type { ReactElement } from "react";

import type { EqBlotterView } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/**
 * The equities blotter panel's head slot: ▤ Orders / ◴ Positions tabs plus a
 * live row count for whichever view is active — mirrors FxBlotterHead/
 * LiveRatesHead. Drives the shared `useEqBlotterView()` preference so the
 * head and EqBlotterPanel body always agree on the active tab.
 */
export function EqBlotterHead(): ReactElement {
  const { useEqBlotterView, useEquityOrders, useEquityPositions } =
    useViewModel();
  const { view, setView } = useEqBlotterView();
  const orders = useEquityOrders();
  const positions = useEquityPositions();
  const count =
    view === "orders"
      ? `${orders.length} orders`
      : `${positions.length} positions`;

  function selectBlotterView(next: EqBlotterView) {
    return () => {
      setView(next);
    };
  }

  return (
    <div className={styles.headTabs}>
      <button
        type="button"
        data-testid="blotter-tab-orders"
        data-active={view === "orders" ? "true" : "false"}
        className={styles.headTab}
        onClick={selectBlotterView("orders")}
      >
        ▤ Orders
      </button>
      <button
        type="button"
        data-testid="blotter-tab-positions"
        data-active={view === "positions" ? "true" : "false"}
        className={styles.headTab}
        onClick={selectBlotterView("positions")}
      >
        ◴ Positions
      </button>
      <span className={styles.headSpacer} />
      <span data-testid="blotter-count" className={styles.count}>
        {count}
      </span>
    </div>
  );
}
