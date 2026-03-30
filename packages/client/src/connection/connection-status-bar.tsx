import { ConnectionStatus } from "@rtc/domain";
import { useConnection } from "./use-connection";

const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Idle",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Offline",
};

const statusColor: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "var(--status-connecting)",
  [ConnectionStatus.CONNECTED]: "var(--status-connected)",
  [ConnectionStatus.DISCONNECTED]: "var(--status-disconnected)",
  [ConnectionStatus.IDLE_DISCONNECTED]: "var(--status-disconnected)",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "var(--status-disconnected)",
};

export function ConnectionStatusBar() {
  const status = useConnection();

  return (
    <div
      data-testid="connection-status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: statusColor[status],
          display: "inline-block",
        }}
      />
      <span>{statusLabel[status]}</span>
    </div>
  );
}
