import type { AppRoute, RouteHistory, WorkspaceTab } from "@rtc/core-api";

import { isSameRoute, workspaceRoute } from "#/routes/appRoutes";

export interface WorkspaceRouteSyncDeps {
  readonly routes: RouteHistory;
  readonly switchTab: (tab: WorkspaceTab) => void;
}

export interface WorkspaceRouteSync {
  /** Every active tab, the first one included: the first call lets the
   * URL's tab win, later ones push each new tab as a history entry.
   * Observing the tab last observed does nothing. */
  observe(tab: WorkspaceTab): void;
  dispose(): void;
}

export function createWorkspaceRouteSync({
  routes,
  switchTab,
}: WorkspaceRouteSyncDeps): WorkspaceRouteSync {
  let shown: WorkspaceTab | null = null;
  let lastObserved: WorkspaceTab | null = null;
  const unsubscribe = routes.subscribe(followTraversal);

  /** Back/Forward: a tab route switches to it; anything else (a login
   * route, none) is rewritten to the tab on screen. */
  function followTraversal(route: AppRoute | null): void {
    if (route?.area === "workspace") {
      if (route.tab !== shown) {
        switchTab(route.tab);
      }

      return;
    }

    if (shown !== null) {
      routes.replace(workspaceRoute(shown));
    }
  }

  return {
    observe: (tab: WorkspaceTab): void => {
      if (tab === lastObserved) {
        return;
      }

      // Before any write or switchTab: a switch can re-enter this call.
      lastObserved = tab;

      const route = routes.current();
      const mounting = shown === null;
      shown = tab;

      if (mounting) {
        if (route?.area !== "workspace") {
          routes.replace(workspaceRoute(tab));
        } else if (route.tab !== tab) {
          switchTab(route.tab);
        }

        return;
      }

      if (!isSameRoute(route, workspaceRoute(tab))) {
        routes.push(workspaceRoute(tab));
      }
    },
    dispose: unsubscribe,
  };
}
