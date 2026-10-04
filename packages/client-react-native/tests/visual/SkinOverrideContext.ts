import { createContext } from "react";

import type { SkinOverride } from "./skinOverride.ts";

/** Set by the harness route from the deep link's `?skin=&mode=`; read by
 * `VisualScenarioHost`. `null` — the default, and what every golden run sees —
 * leaves the scenario's own pin in force. */
export const SkinOverrideContext = createContext<SkinOverride | null>(null);
