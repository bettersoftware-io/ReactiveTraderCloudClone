import type { ReactElement } from "react";
import { useState } from "react";

import { useHooks } from "./hooks/useHooks";
import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { appPanelRegistry } from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

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
      <AmbientBackground />
      <HeaderChrome activeTab={activeTab} onTabChange={setActiveTab} />
      <WorkspaceEngine key={activeTab} tab={activeTab} />
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
    </div>
  );
}
