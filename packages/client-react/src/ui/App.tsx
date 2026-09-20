import type { ReactElement } from "react";

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
import { DockviewLayoutEngine } from "./shell/layout/dockview/DockviewLayoutEngine";
import {
  appHeadRegistry,
  dockedHeadsFor,
} from "./shell/layout/engine/appHeadRegistry";
import {
  appPanelRegistry,
  dockedRegistryFor,
  dockedSpecsFor,
  instanceRegistryFor,
  instanceSpecsFor,
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

function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const {
    useLayout,
    useJarvisPanels,
    useLayoutEngine,
    useDockLayoutStore,
    useDockedPanelIds,
    useWorkspaceLayoutResets,
    useReportDetachedPanels,
    useRegisterLayoutSnapshot,
  } = useViewModel();

  const { state, maximize, restore, collapse, expand, resize, closeInstance } =
    useLayout(tab);
  const docked = useDockedPanelIds(tab);
  const layoutResets = useWorkspaceLayoutResets();
  const reportDetachedPanels = useReportDetachedPanels();
  const registerLayoutSnapshot = useRegisterLayoutSnapshot();
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
  const registry = {
    ...appPanelRegistry,
    ...dockedRegistryFor(dockedPanels),
  };

  const specs = {
    ...PANEL_SPECS,
    ...dockedSpecsFor(dockedPanels),
  };

  // Chart instances (layer-2 membership the layout machine owns) merge in
  // after the docked slices for the Dockview engine ONLY — an instance id is
  // not in the layout tree, so in-house never renders one and never receives
  // one (the Solid twin's split, too). Rebuilding these per render remounts
  // nothing: the bridge's portals are keyed by slot/panel/mount and reconcile
  // the same element types in place.
  const dockviewRegistry = {
    ...registry,
    ...instanceRegistryFor(state.instances),
  };

  const dockviewSpecs = {
    ...specs,
    ...instanceSpecsFor(state.instances),
  };

  const headRegistry = {
    ...appHeadRegistry,
    ...dockedHeadsFor(dockedPanels, undockPanel, dismissPanel),
  };
  const { engine } = useLayoutEngine();
  const dockLayoutStore = useDockLayoutStore();
  return (
    <FxViewProvider>
      <CreditViewProvider>
        {/* Both engines are static imports — no lazy()/Suspense split. The
         * in-house engine's own chunk measured ~3.8KB gzip (~1.2% of the
         * bundle), not worth a chunk boundary; a prior version of this file
         * lazy-loaded it, which armed the #594 blank-golden class on every
         * in-house `app/*`/layout visual scenario and forced contract specs
         * to explicitly flush a Suspense boundary before asserting. */}
        {engine === "dockview" ? (
          <DockviewLayoutEngine
            tab={tab}
            registry={dockviewRegistry}
            specs={dockviewSpecs}
            headRegistry={headRegistry}
            store={dockLayoutStore}
            maximized={state.maximized}
            collapsed={state.collapsed}
            closed={state.closed}
            docked={docked}
            instances={state.instances}
            layoutResets={layoutResets}
            onMaximize={maximize}
            onRestore={restore}
            onCollapse={collapse}
            onExpand={expand}
            onCloseInstance={closeInstance}
            onDetachedPanelsChange={reportDetachedPanels}
            onSnapshotSourceChange={registerLayoutSnapshot}
          />
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
