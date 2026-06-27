import type { ReactElement } from "react";

import { useHooks } from "#/ui/hooks/useHooks";

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
export function StatusBar(): ReactElement {
  const { useSession } = useHooks();
  const { state } = useSession();

  return (
    <footer className={styles.statusBar}>
      <ConnectionStatusBar />
      <span className={styles.operator} data-testid="status-operator">
        {state.user.id}
      </span>
      <CosmeticMetrics />
    </footer>
  );
}
