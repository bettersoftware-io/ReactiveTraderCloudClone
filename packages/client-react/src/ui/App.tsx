import { lazy, type ReactElement, Suspense } from "react";

import { PANEL_SPECS } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import { CreditViewProvider } from "./credit/CreditViewProvider";
import { FxViewProvider } from "./fx/FxViewProvider";
import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { JarvisOverlay } from "./shell/jarvis/JarvisOverlay";
import { JarvisPanelLayer } from "./shell/jarvis/panels/JarvisPanelLayer";
import { useJarvisDrivenPulse } from "./shell/jarvis/useJarvisDrivenPulse";
import {
  appHeadRegistry,
  dockedHeadsFor,
} from "./shell/layout/engine/appHeadRegistry";
import {
  appPanelRegistry,
  dockedRegistryFor,
  dockedSpecsFor,
} from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";
import drivenPulseStyles from "./shell/jarvis/DrivenPulse.module.css";

export function App(): ReactElement {
  // Machine-backed nav (Task 10): the promoted composition-root singleton
  // (Presenters.workspaceNav) replacing the useState<WorkspaceTab> that used
  // to live here — reachable now from Jarvis's drive-the-app "switchTab"
  // command too. `key={activeTab}` below is unchanged: WorkspaceEngine still
  // remounts per tab, but the underlying layout machines now survive that
  // remount (see Presenters.layoutFor's doc).
  const { useWorkspaceNav } = useViewModel();
  const { state: navState, switchTab } = useWorkspaceNav();
  const activeTab = navState.activeTab;
  const { pulsing, clearPulse } = useJarvisDrivenPulse();

  return (
    <div className={styles.app}>
      <AmbientBackground />
      <HeaderChrome activeTab={activeTab} onTabChange={switchTab} />
      <div
        data-jarvis-driven={pulsing ? "true" : "false"}
        className={
          pulsing
            ? `${styles.workspaceRegion} ${drivenPulseStyles.driven}`
            : styles.workspaceRegion
        }
        onAnimationEnd={clearPulse}
      >
        <WorkspaceEngine key={activeTab} tab={activeTab} />
      </div>
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
      <JarvisOverlay />
      <JarvisPanelLayer />
    </div>
  );
}

interface WorkspaceEngineProps {
  tab: WorkspaceTab;
}

// Lazy: dockview + its CSS is ~75KB gzip, but the default in-house engine
// serves ~100% of users — split it into its own chunk instead of shipping
// it to everyone.
const DockviewLayoutEngine = lazy(() => {
  return import("./shell/layout/dockview/DockviewLayoutEngine").then((m) => {
    return { default: m.DockviewLayoutEngine };
  });
});

function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const { useLayout, useJarvisPanels, useLayoutEngine, useDockLayoutStore } =
    useViewModel();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(tab);
  // Docked desk panels render as leaves inside THIS engine (not the
  // floating JarvisPanelLayer, which renders floatingPanels only) — merged
  // on top of the static app registries so a dock/undock or a live spec
  // edit ("make it a table" while docked) is reflected on the very next
  // render, regardless of which tab the panel was docked into.
  const { dockedPanels, undockPanel, dismissPanel } = useJarvisPanels();
  const registry = { ...appPanelRegistry, ...dockedRegistryFor(dockedPanels) };
  const specs = { ...PANEL_SPECS, ...dockedSpecsFor(dockedPanels) };
  const headRegistry = {
    ...appHeadRegistry,
    ...dockedHeadsFor(dockedPanels, undockPanel, dismissPanel),
  };
  const { engine } = useLayoutEngine();
  const dockLayoutStore = useDockLayoutStore();
  return (
    <FxViewProvider>
      <CreditViewProvider>
        {engine === "dockview" ? (
          <Suspense fallback={null}>
            {/* Same merged registries as the in-house branch: dockview looks
                a docked panel's body/head/spec up by id exactly as the
                in-house engine does. Its SEED tree is still the static
                default (createDefaultLayoutPort), so a pinned panel only
                surfaces here once its id is in the persisted blob — docking
                a Jarvis panel INTO dockview is not wired this round. */}
            <DockviewLayoutEngine
              tab={tab}
              registry={registry}
              specs={specs}
              headRegistry={headRegistry}
              store={dockLayoutStore}
              maximized={state.maximized}
            />
          </Suspense>
        ) : (
          <InhouseLayoutEngine
            state={state}
            registry={registry}
            specs={specs}
            headRegistry={headRegistry}
            onMaximize={maximize}
            onRestore={restore}
            onCollapse={collapse}
            onExpand={expand}
            onResize={resize}
          />
        )}
      </CreditViewProvider>
    </FxViewProvider>
  );
}
