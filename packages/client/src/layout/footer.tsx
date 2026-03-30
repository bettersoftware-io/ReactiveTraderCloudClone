import { ConnectionStatusBar } from "../connection/connection-status-bar";

export function Footer() {
  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 16px",
        height: 28,
        backgroundColor: "var(--bg-footer)",
        borderTop: "1px solid var(--border-primary)",
      }}
    >
      <ConnectionStatusBar />
    </footer>
  );
}
