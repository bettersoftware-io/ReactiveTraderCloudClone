import type { ReactElement } from "react";
import { useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { FxViewProvider } from "./fx/FxViewProvider";
import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { appHeadRegistry } from "./shell/layout/engine/appHeadRegistry";
import { appPanelRegistry } from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";

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

interface WorkspaceEngineProps {
  tab: WorkspaceTab;
}

function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const { useLayout } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(tab);
  return (
    <FxViewProvider>
      <InhouseLayoutEngine
        state={state}
        registry={appPanelRegistry}
        headRegistry={appHeadRegistry}
        onMaximize={maximize}
        onRestore={restore}
        onCollapse={collapse}
        onExpand={expand}
        onResize={resize}
      />
    </FxViewProvider>
  );
}
