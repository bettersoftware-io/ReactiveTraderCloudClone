import type { JSX } from "solid-js";
import { createSignal } from "solid-js";

import { AmbientBackground } from "./shell/background/AmbientBackground";
import { HeaderChrome, type WorkspaceTab } from "./shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { LockScreen } from "./shell/lock/LockScreen";
import { StatusBar } from "./shell/status/StatusBar";

import styles from "./App.module.css";

/** Shell chrome wired to the real ViewModel (Task 9 — theme/chrome/boot/lock).
 * The workspace itself (FX/Credit/Equities/Admin panels behind the in-house
 * layout engine) is not ported yet (Task 10 — layout-engine cluster, then
 * Tasks 13-16 per domain): the active tab still switches via local view
 * state so HeaderChrome's nav is exercisable, but the tab body is a plain
 * placeholder until its subtree lands. */
export function App(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<WorkspaceTab>("fx");

  return (
    <div class={styles.app}>
      <AmbientBackground />
      <HeaderChrome activeTab={activeTab()} onTabChange={setActiveTab} />
      <div data-testid="pending-panel" />
      <StatusBar />
      <ConnectionOverlay />
      <LockScreen />
    </div>
  );
}
