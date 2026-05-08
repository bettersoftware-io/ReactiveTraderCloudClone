import { ConnectionStatus } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";

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
    <div
      data-testid="connection-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--bg-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          borderRadius: 8,
          padding: "32px 48px",
          textAlign: "center",
          color: "var(--text-primary)",
          maxWidth: 400,
        }}
      >
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{message}</p>
      </div>
    </div>
  );
}
