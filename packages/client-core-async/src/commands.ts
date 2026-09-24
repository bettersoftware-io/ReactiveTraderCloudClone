import type { AppCommands, WorkspaceTab } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8.
 * `reportDetachedPanels` DELEGATES to `base` by reference: its registry is
 * read by the Jarvis driver, which is itself still delegated to the RxJS
 * core, so the write must land in that same core's registry. */
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
