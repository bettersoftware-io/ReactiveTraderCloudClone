import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
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
 * plus one shared WorkspaceEngine serving every tab's live layout engine and
 * panel subtree: FX (Tasks 10/13), Credit (Task 14), Equities (Task 15), and
 * Admin (Task 16), all through the SAME `appPanelRegistry`/`appHeadRegistry`,
 * keyed by panel id — the exact structure of the react `App.tsx`. */
export function App(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<WorkspaceTab>("fx");

  return (
    <div class={styles.app}>
      <AmbientBackground />
      <HeaderChrome activeTab={activeTab()} onTabChange={setActiveTab} />
      <Show when={activeTab()} keyed>
        {(tab) => {
          return <WorkspaceEngine tab={tab} />;
        }}
      </Show>
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
    </div>
  );
}

interface WorkspaceEngineProps {
  tab: WorkspaceTab;
}

/** Owns the active tab's `useLayout(tab)` machine and nests BOTH domain
 * view-context seams (`FxViewProvider` → `CreditViewProvider`), mirroring the
 * react `App.tsx`'s single `WorkspaceEngine` that serves all tabs from one
 * component. The keyed `<Show>` in `App` is the Solid-native equivalent of
 * the react original's `key={activeTab}` forced remount: switching tabs
 * genuinely unmounts this component (running the layout machine's
 * `onCleanup` disposal) and mounts a fresh one for the new tab — which is
 * also why reading `props.tab` once at setup is intentional here: the
 * component can never see a different tab within one lifetime. */
function WorkspaceEngine(props: WorkspaceEngineProps): JSX.Element {
  const { useLayout } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct under the keyed-<Show> remount (see doc comment)
    props.tab,
  );

  return (
    <FxViewProvider>
      <CreditViewProvider>
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
      </CreditViewProvider>
    </FxViewProvider>
  );
}
