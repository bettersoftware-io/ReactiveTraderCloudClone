import type { JSX } from "solid-js";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./App.module.css";

/** Walking-skeleton root component: renders live connection status from the
 * real ViewModel (backed by simulator ports in dev — see AppRoot/
 * buildBrowserPorts). The shell/FX/credit/equities/admin panels this grows
 * into are Phase 2+ (see docs/superpowers/sdd task briefs); for now this is
 * the one dumb-UI component proving the Solid↔ViewModel seam end to end. */
export function App(): JSX.Element {
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();

  return (
    <div class={styles.app}>
      <div data-testid="connection-status" data-status={status()}>
        {statusLabel[status()]}
      </div>
    </div>
  );
}

// Provenance: mirrors client-react's ConnectionStatusBar.tsx label mapping
// (footer collapses IDLE_DISCONNECTED/OFFLINE_DISCONNECTED to "Disconnected").
const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Disconnected",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Disconnected",
};
