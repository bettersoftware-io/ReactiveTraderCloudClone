import { ConnectionStatus } from "@rtc/domain";
import styles from "./ConnectionStatusBar.module.css";
import { useHooks } from "../../hooks/useHooks";

const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Idle",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Offline",
};

export function ConnectionStatusBar() {
  const { useConnectionStatus } = useHooks();
  const status = useConnectionStatus();

  return (
    <div data-testid="connection-status" className={styles.statusBar}>
      <span data-status={status} className={styles.dot} />
      <span>{statusLabel[status]}</span>
    </div>
  );
}
