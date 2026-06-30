import type { ReactElement } from "react";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./ConnectionOverlay.module.css";

export function ConnectionOverlay(): ReactElement | null {
  const { useConnectionStatus, useReconnect, useIncident } = useViewModel();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const { state: incidentState, clear: clearIncident } = useIncident();
  const message = overlayMessages[status];

  if (!message) return null;

  const isIdle = status === ConnectionStatus.IDLE_DISCONNECTED;
  const incidentActive = incidentState.active.length > 0;

  return (
    <div data-testid="connection-overlay" className={styles.overlay}>
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
        {isIdle && (
          <button
            type="button"
            data-testid="reconnect-button"
            className={styles.reconnectButton}
            onClick={reconnect}
          >
            Reconnect
          </button>
        )}
        {status === ConnectionStatus.DISCONNECTED && incidentActive && (
          <button
            type="button"
            data-testid="connection-overlay-clear-incident"
            className={styles.reconnectButton}
            onClick={clearIncident}
          >
            Clear incident
          </button>
        )}
      </div>
    </div>
  );
}

// The distinct idle/offline/plain disconnection wording lives here, in the
// modal — the footer only ever shows "Disconnected".
// Provenance: original components/DisconnectionOverlay.tsx:29-42.
const overlayMessages: Partial<Record<ConnectionStatus, string>> = {
  [ConnectionStatus.DISCONNECTED]: "Trying to re-connect to the server...",
  [ConnectionStatus.IDLE_DISCONNECTED]:
    "You have been disconnected due to inactivity.",
  [ConnectionStatus.OFFLINE_DISCONNECTED]:
    "This device has been detected to be offline.  Connection to the server will resume when a stable internet connection is established.",
};
