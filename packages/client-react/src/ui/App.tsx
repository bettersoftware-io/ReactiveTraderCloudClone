import type { ReactElement } from "react";
import { useState } from "react";

import { useHooks } from "./hooks/useHooks";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { appPanelRegistry } from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { Footer } from "./shell/layout/Footer";
import { Header, type WorkspaceTab } from "./shell/layout/Header";

import styles from "./App.module.css";

interface WorkspaceEngineProps {
  tab: WorkspaceTab;
}

function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const { useLayout } = useHooks();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(tab);
  return (
    <InhouseLayoutEngine
      state={state}
      registry={appPanelRegistry}
      onMaximize={maximize}
      onRestore={restore}
      onCollapse={collapse}
      onExpand={expand}
      onResize={resize}
    />
  );
}

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("fx");

  return (
    <div className={styles.app}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <WorkspaceEngine key={activeTab} tab={activeTab} />
      <Footer />
      <ConnectionOverlay />
    </div>
  );
}
