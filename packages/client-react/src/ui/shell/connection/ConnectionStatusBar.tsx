import type { ReactElement } from "react";

import { ConnectionStatus } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ConnectionStatusBar.module.css";

// Footer collapses IDLE_DISCONNECTED and OFFLINE_DISCONNECTED to "Disconnected":
// the distinct idle/offline wording lives in ConnectionOverlay, not the footer.
// Provenance: original App/Footer/StatusButton/StatusButton.tsx:8-19.
const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Disconnected",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Disconnected",
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
