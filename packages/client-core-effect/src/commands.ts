// packages/client-core-effect/src/commands.ts
import type {
  AppCommands,
  ConnectionIntentsPort,
  WorkspaceTab,
} from "@rtc/core-api";

/** The app's imperative commands, owned by this core. `reconnect` pushes
 * through the client-supplied `ports.connectionIntents`, which the client
 * merges into `connectionEvents` — the connection presenter sees it there.
 * `reportDetachedPanels` writes this core's NATIVE workspace registry
 * (slice 7): this core's own Jarvis driver reads that same registry
 * through the workspace's `drive.detachedPanelIds`. */
export function createCommands(
  connectionIntents: ConnectionIntentsPort,
  reportDetachedPanels: (
    tab: WorkspaceTab,
    panelIds: readonly string[],
  ) => void,
): AppCommands {
  return {
    reconnect: () => {
      connectionIntents.reconnect();
    },
    reportDetachedPanels,
  };
}
