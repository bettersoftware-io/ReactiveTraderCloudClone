import { lazy, type ReactElement, Suspense } from "react";

import { PANEL_SPECS, visibleRootOf } from "@rtc/client-core";
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

// Dockview stays behind lazy()/Suspense; the in-house engine stays STATIC.
// Two separate reasons, and they do not generalise to each other:
//   - IN-HOUSE STATIC: its own chunk measures ~3.8KB gzip (~1.2% of the
//     bundle) — not worth a chunk boundary, and splitting it armed the #594
//     blank-golden class on all 11 in-house `app/*`/layout scenarios (none
//     of which carries a readiness gate) and forced contract specs to flush
//     a Suspense boundary before asserting.
//   - DOCKVIEW LAZY: not primarily about bytes (its chunk is ~75KB gzip) but
//     about MOUNT TIMING. Every `*-dockview` golden was generated with the
//     engine arriving one commit late, and those scenarios carry explicit
//     `waitForText` gates for exactly that. Mounting it eagerly makes
//     `createDockEngine` measure a container that has not finished settling,
//     which shifted the FX blotter's contents 1px and doubled the measured
//     distance from the in-house twin (14893 → 29034 differing pixels in the
//     classic-dark blotter band) — i.e. eager mounting moves the default
//     engine AWAY from in-house parity. Keep it deferred.
const DockviewLayoutEngine = lazy(() => {
  return import("./shell/layout/dockview/DockviewLayoutEngine").then((m) => {
    return { default: m.DockviewLayoutEngine };
  });
});

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

function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const {
    useLayout,
    useJarvisPanels,
    useLayoutEngine,
    useDockLayoutStore,
    useDockedPanelIds,
    useWorkspaceLayoutResets,
  } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(tab);
  const docked = useDockedPanelIds(tab);
  const layoutResets = useWorkspaceLayoutResets();
  // The in-house engine renders the VISIBLE projection: View-menu-closed
  // leaves are pruned from the tree it sees (visibleRootOf is referentially
  // stable when nothing is closed). The Dockview branch keeps the raw state
  // fields — its projection is the bridge's closed-set replay.
  const visibleState = {
    ...state,
    root: visibleRootOf(state.root, state.closed),
  };
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
            <DockviewLayoutEngine
              tab={tab}
              registry={registry}
              specs={specs}
              headRegistry={headRegistry}
              store={dockLayoutStore}
              maximized={state.maximized}
              collapsed={state.collapsed}
              closed={state.closed}
              docked={docked}
              layoutResets={layoutResets}
              onMaximize={maximize}
              onRestore={restore}
              onCollapse={collapse}
              onExpand={expand}
            />
          </Suspense>
        ) : (
          <InhouseLayoutEngine
            state={visibleState}
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
