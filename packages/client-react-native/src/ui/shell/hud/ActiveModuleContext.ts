// packages/client-react-native/src/ui/shell/hud/ActiveModuleContext.ts
import { createContext } from "react";

import type { ModuleRoute } from "./moduleRoutes";

/** A pinned active module the visual harness injects so the status strip's
 * MODULE label and the dock's FAB glyph name the module a scenario actually
 * shows, rather than what `resolveActiveModule(usePathname())` derives —
 * which, under the harness route `/__visual/<id>`, is always RATES. The same
 * seam shape as `ShellTelemetryContext`: `null` in production ⇒ the pathname
 * decides, as it always has. */
export const ActiveModuleContext = createContext<ModuleRoute | null>(null);
