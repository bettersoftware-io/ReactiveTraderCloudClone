import type { JSX } from "solid-js";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./ConnectionStatusBar.module.css";

export function ConnectionStatusBar(): JSX.Element {
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();

  return (
    <div data-testid="connection-status" class={styles.statusBar}>
      <span data-status={status()} class={styles.dot} />
      <span data-status={status()} class={styles.label}>
        {statusLabel[status()]}
      </span>
    </div>
  );
}

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
