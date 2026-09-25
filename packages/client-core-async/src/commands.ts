import type { AppCommands, WorkspaceTab } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8.
 * `reportDetachedPanels` writes this core's NATIVE workspace registry
 * (slice 7): this core's own Jarvis driver reads that same registry
 * through the workspace's `drive.detachedPanelIds`. */
export function createCommands(
  reportDetachedPanels: (
    tab: WorkspaceTab,
    panelIds: readonly string[],
  ) => void,
): AppCommands {
  return {
    reconnect: () => {
      pushReconnectIntent();
    },
    reportDetachedPanels,
  };
}
