import { LiveRatesPanel } from "../fx/live-rates/live-rates-panel";

export function Workspace() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        backgroundColor: "var(--bg-primary)",
        padding: 16,
      }}
    >
      <LiveRatesPanel />
    </main>
  );
}
