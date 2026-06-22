import { AdminPanel } from "#/ui/admin/AdminPanel";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";

import type { WorkspaceTab } from "./Header";

import styles from "./Workspace.module.css";

interface WorkspaceProps {
  activeTab: WorkspaceTab;
}

function FxWorkspace() {
  return (
    <>
      <div className={styles.fxSplitRow}>
        <div className={styles.fxMain}>
          <LiveRatesPanel />
        </div>
        <div className={styles.fxSide}>
          <AnalyticsPanel />
        </div>
      </div>
      <FxBlotter />
    </>
  );
}

export function Workspace({ activeTab }: WorkspaceProps) {
  return (
    <main className={styles.workspace}>
      {activeTab === "fx" ? (
        <FxWorkspace />
      ) : activeTab === "credit" ? (
        <CreditWorkspace />
      ) : (
        <AdminPanel />
      )}
    </main>
  );
}
