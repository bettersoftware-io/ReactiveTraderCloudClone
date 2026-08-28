import { usePathname } from "expo-router";
import { useContext } from "react";

import { ActiveModuleContext } from "./ActiveModuleContext";
import { type ModuleRoute, resolveActiveModule } from "./moduleRoutes";

/** The module the chrome should name right now: a pinned one when a
 * `ActiveModuleContext` provider sits above (the visual harness), else the
 * one the current expo-router pathname resolves to — the dock and deep links
 * both drive it. Both hooks are called unconditionally so the order never
 * changes between the two branches. */
export function useActiveModule(): ModuleRoute {
  const pinned = useContext(ActiveModuleContext);
  const pathname = usePathname();
  return pinned ?? resolveActiveModule(pathname);
}
