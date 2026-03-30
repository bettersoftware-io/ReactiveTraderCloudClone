import { LiveRatesPanel } from "../fx/live-rates/live-rates-panel";
import { FxBlotter } from "../blotter/fx-blotter";
import { AnalyticsPanel } from "../analytics/analytics-panel";

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
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LiveRatesPanel />
        </div>
        <div style={{ width: 320, flexShrink: 0 }}>
          <AnalyticsPanel />
        </div>
      </div>
      <FxBlotter />
    </main>
  );
}
