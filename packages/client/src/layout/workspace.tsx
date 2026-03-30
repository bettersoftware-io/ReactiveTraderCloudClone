import { LiveRatesPanel } from "../fx/live-rates/live-rates-panel";
import { FxBlotter } from "../blotter/fx-blotter";

export function Workspace() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        backgroundColor: "var(--bg-primary)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <LiveRatesPanel />
      <FxBlotter />
    </main>
  );
}
