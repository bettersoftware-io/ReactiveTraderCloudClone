import type { AuthDepsPrimitives } from "@rtc/core-logic";

import { withLoginDelay } from "#/bridge/loginDelay";
import { peek } from "#/bridge/peek";

/** The auth wiring's two stream operations, from this core's bridge (the only
 * place it may use rxjs at runtime). */
export const authDepsPrimitives: AuthDepsPrimitives = {
  readNow: peek,
  delayAuth: withLoginDelay,
};
