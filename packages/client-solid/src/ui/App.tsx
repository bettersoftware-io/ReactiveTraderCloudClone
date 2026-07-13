import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { FxViewProvider } from "#/ui/fx/FxViewProvider";

import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { appHeadRegistry } from "./shell/layout/engine/appHeadRegistry";
import { appPanelRegistry } from "./shell/layout/engine/appPanelRegistry";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";

/** Shell chrome wired to the real ViewModel (Task 9 — theme/chrome/boot/lock)
 * plus the FX tab's live layout engine (Task 10 — layout-engine cluster) and
 * the real FX panel subtree (Task 13 — liveRates/tiles/blotter/analytics/
 * positions via `appPanelRegistry`/`appHeadRegistry`). Credit/Equities/Admin
 * stay the plain placeholder div until their own subtrees land (Tasks
 * 14-16), at which point they join the FX tab under one shared
 * WorkspaceEngine (mirroring the react `App.tsx`'s single unconditional
 * `WorkspaceEngine` for every tab) instead of this per-tab `<Show>` gate. */
export function App(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<WorkspaceTab>("fx");

  return (
    <div class={styles.app}>
      <AmbientBackground />
      <HeaderChrome activeTab={activeTab()} onTabChange={setActiveTab} />
      <Show
        when={activeTab() === "fx"}
        fallback={<div data-testid="pending-panel" />}
      >
        <FxWorkspace />
      </Show>
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
    </div>
  );
}

/** Owns the FX tab's `useLayout("fx")` machine and the FxViewContext seam
 * (rates/blotter tab, quick filter, CSV export handoff) consumed by the FX
 * panel heads/bodies below it. Mounted (and its machine constructed) only
 * while the FX tab is active — `<Show>` above genuinely unmounts this
 * component on switching away, running the machine's `onCleanup` disposal,
 * the Solid-native equivalent of the React original's `key={activeTab}`
 * forced-remount trick (no explicit key needed: Solid's conditional
 * rendering already mounts/unmounts for real). */
function FxWorkspace(): JSX.Element {
  const { useLayout } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } =
    useLayout("fx");

  return (
    <FxViewProvider>
      <InhouseLayoutEngine
        state={state()}
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
