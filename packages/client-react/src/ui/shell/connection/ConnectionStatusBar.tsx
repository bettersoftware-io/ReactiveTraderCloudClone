import type { ReactElement } from "react";

import { ConnectionStatus } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ConnectionStatusBar.module.css";

const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Idle",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Offline",
};

export function ConnectionStatusBar(): ReactElement {
  const { useConnectionStatus } = useHooks();
  const status = useConnectionStatus();

  return (
    <div data-testid="connection-status" className={styles.statusBar}>
      <span data-status={status} className={styles.dot} />
      <span>{statusLabel[status]}</span>
    </div>
  );
}
