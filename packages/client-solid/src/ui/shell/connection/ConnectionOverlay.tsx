import type { JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./ConnectionOverlay.module.css";

export function ConnectionOverlay(): JSX.Element {
  const { useConnectionStatus, useReconnect, useIncident } = useViewModel();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const { state: incidentState, clear: clearIncident } = useIncident();

  const message = createMemo((): string | undefined => {
    return overlayMessages[status()];
  });

  return (
    <Show when={message()}>
      <div data-testid="connection-overlay" class={styles.overlay}>
        <div class={styles.card}>
          <p class={styles.message}>{message()}</p>
          <Show when={status() === ConnectionStatus.IDLE_DISCONNECTED}>
            <button
              type="button"
              data-testid="reconnect-button"
              class={styles.reconnectButton}
              onClick={reconnect}
            >
              Reconnect
            </button>
          </Show>
          <Show
            when={
              status() === ConnectionStatus.DISCONNECTED &&
              incidentState().active.length > 0
            }
          >
            <button
              type="button"
              data-testid="connection-overlay-clear-incident"
              class={styles.reconnectButton}
              onClick={clearIncident}
            >
              Clear incident
            </button>
          </Show>
        </div>
      </div>
    </Show>
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
