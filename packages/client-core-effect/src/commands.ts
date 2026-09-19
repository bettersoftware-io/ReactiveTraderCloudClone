// packages/client-core-effect/src/commands.ts
import type { AppCommands } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8. */
export function createCommands(): AppCommands {
  return {
    reconnect: () => {
      pushReconnectIntent();
    },
  };
}
