import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { InhouseLayoutEngine } from "./shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "./shell/layout/engine/panelRegistry";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";

/** Shell chrome wired to the real ViewModel (Task 9 — theme/chrome/boot/lock)
 * plus the FX tab's live layout engine (Task 10 — layout-engine cluster).
 * Credit/Equities/Admin stay the plain placeholder div until their own
 * subtrees land (Tasks 14-16); FX's own PANEL BODIES are still placeholders
 * too — only the grid/chrome/drag/resize/collapse/maximize plumbing around
 * them is real, per the Task 10 brief ("Task 13 fills them"). */
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

/** Every FX panel id (see `FX_ROOT` in `@rtc/client-core`'s
 * defaultLayoutPort.ts: fx-rates/fx-blotter form the left column, fx-analytics/
 * fx-positions the right rail) maps to a bare placeholder body until Task 13
 * ports the real FX subtree (liveRates/analytics/positions/blotter) and
 * swaps this for a real `appPanelRegistry.tsx` module-root map (deferred —
 * its imports don't exist in client-solid yet). */
const fxPlaceholderRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="pending-panel" />;
  },
  "fx-analytics": () => {
    return <div data-testid="pending-panel" />;
  },
  "fx-positions": () => {
    return <div data-testid="pending-panel" />;
  },
  "fx-blotter": () => {
    return <div data-testid="pending-panel" />;
  },
};

/** Owns the FX tab's `useLayout("fx")` machine. Mounted (and its machine
 * constructed) only while the FX tab is active — `<Show>` above genuinely
 * unmounts this component on switching away, running the machine's
 * `onCleanup` disposal, the Solid-native equivalent of the React original's
 * `key={activeTab}` forced-remount trick (no explicit key needed: Solid's
 * conditional rendering already mounts/unmounts for real). */
function FxWorkspace(): JSX.Element {
  const { useLayout } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } =
    useLayout("fx");

  return (
    <InhouseLayoutEngine
      state={state()}
      registry={fxPlaceholderRegistry}
      onMaximize={maximize}
      onRestore={restore}
      onCollapse={collapse}
      onExpand={expand}
      onResize={resize}
    />
  );
}
