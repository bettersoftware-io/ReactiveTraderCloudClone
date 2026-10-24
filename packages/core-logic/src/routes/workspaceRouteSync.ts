import type { AppRoute, RouteHistory, WorkspaceTab } from "@rtc/core-api";

import { isSameRoute, workspaceRoute } from "#/routes/appRoutes";

export interface WorkspaceRouteSyncDeps {
  readonly routes: RouteHistory;
  /** Whether the signed-in user may see a tab. Read at each call, never
   * captured: the visible tabs change when the user signs in or out. A URL,
   * a mount or a Back/Forward step never shows a tab this refuses. */
  readonly canShow: (tab: WorkspaceTab) => boolean;
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
  canShow,
  switchTab,
}: WorkspaceRouteSyncDeps): WorkspaceRouteSync {
  /** The tab last observed — the one on screen. */
  let shown: WorkspaceTab | null = null;
  const unsubscribe = routes.subscribe(followTraversal);

  /** Back/Forward: a tab route the user may see switches to it; a hidden
   * tab, a login route or none is rewritten to the tab on screen. */
  function followTraversal(route: AppRoute | null): void {
    if (route?.area === "workspace" && canShow(route.tab)) {
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
      if (tab === shown) {
        return;
      }

      const route = routes.current();
      const mounting = shown === null;
      // Before any write or switchTab: a switch can re-enter this call.
      shown = tab;

      if (mounting) {
        if (route?.area !== "workspace") {
          routes.replace(workspaceRoute(tab));
        } else if (!canShow(route.tab)) {
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
