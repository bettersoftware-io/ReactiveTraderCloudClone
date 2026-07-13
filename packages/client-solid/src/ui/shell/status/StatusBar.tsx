import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";
import { CosmeticMetrics } from "./CosmeticMetrics";

import styles from "./StatusBar.module.css";

/**
 * HUD bottom status bar — ported from the prototype footer
 * (Reactive Trader.dc.html:720-730). The connection segment reuses the real
 * `ConnectionStatusBar` (carries the `connection-status` e2e testid, driven by
 * `useConnectionStatus`); the operator segment is wired to the session seam
 * (`useSession`); the latency/FPS/MEM/POS/P&L + build + clock readouts are
 * decorative (see CosmeticMetrics).
 */
export function StatusBar(): JSX.Element {
  const { useSession } = useViewModel();
  const { state } = useSession();

  return (
    <footer class={styles.statusBar}>
      <ConnectionStatusBar />
      <span class={styles.metricSep}>│</span>
      <span class={styles.operator} data-testid="status-operator">
        {state().user.id}
      </span>
      <CosmeticMetrics />
    </footer>
  );
}
