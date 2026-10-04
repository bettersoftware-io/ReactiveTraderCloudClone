import { createContext } from "react";

import type { BuildStamp } from "#/ui/shell/buildStamp";

/** The running build's stamp, supplied by the app layer (`AppRoot`). `null` —
 * the default, and what a development run and the visual harness see — means
 * "no stamp": the status strip keeps its static tag and the sign-in screen
 * prints no build line. */
export const BuildStampContext = createContext<BuildStamp | null>(null);
