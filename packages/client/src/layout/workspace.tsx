import { LiveRatesPanel } from "../fx/live-rates/live-rates-panel";
import { FxBlotter } from "../blotter/fx-blotter";
import { AnalyticsPanel } from "../analytics/analytics-panel";
import { CreditWorkspace } from "../credit/credit-workspace";
import { AdminPanel } from "../admin/admin-panel";
import type { WorkspaceTab } from "./header";

interface WorkspaceProps {
  activeTab: WorkspaceTab;
}

function FxWorkspace() {
  return (
    <>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LiveRatesPanel />
        </div>
        <div style={{ width: 320, flexShrink: 0 }}>
          <AnalyticsPanel />
        </div>
      </div>
      <FxBlotter />
    </>
  );
}

export function Workspace({ activeTab }: WorkspaceProps) {
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
      {activeTab === "fx" ? <FxWorkspace /> : activeTab === "credit" ? <CreditWorkspace /> : <AdminPanel />}
    </main>
  );
}
