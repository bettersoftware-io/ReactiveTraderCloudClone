import { ConnectionStatus } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import styles from "./ConnectionOverlay.module.css";

const overlayMessages: Partial<Record<ConnectionStatus, string>> = {
  [ConnectionStatus.DISCONNECTED]: "Disconnected. Reconnecting...",
  [ConnectionStatus.IDLE_DISCONNECTED]:
    "You have been disconnected due to inactivity. Move the mouse or click to reconnect.",
  [ConnectionStatus.OFFLINE_DISCONNECTED]:
    "Your browser appears to be offline. Check your network connection.",
};

export function ConnectionOverlay() {
  const { useConnectionStatus } = useHooks();
  const status = useConnectionStatus();
  const message = overlayMessages[status];

  if (!message) return null;

  return (
    <div data-testid="connection-overlay" className={styles.overlay}>
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
