import { LiveRatesPanel } from "../../fx/liveRates/LiveRatesPanel";
import { FxBlotter } from "../../fx/blotter/FxBlotter";
import { AnalyticsPanel } from "../../fx/analytics/AnalyticsPanel";
import { CreditWorkspace } from "../../credit/CreditWorkspace";
import { AdminPanel } from "../../admin/AdminPanel";
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
      {activeTab === "fx" ? <FxWorkspace /> : activeTab === "credit" ? <CreditWorkspace /> : <AdminPanel />}
    </main>
  );
}
