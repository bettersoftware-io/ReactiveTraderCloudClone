// packages/client-core-effect/src/commands.ts
import type { AppCommands, WorkspaceTab } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8.
 * `reportDetachedPanels` writes this core's NATIVE workspace registry
 * (slice 7, wave 1): the base's Jarvis driver reads that same registry
 * through `CoreSeams.workspace`'s `detachedPanelIds`. */
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
