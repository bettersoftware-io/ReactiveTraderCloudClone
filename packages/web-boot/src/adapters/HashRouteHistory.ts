import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The page's history as hash routes. A push or replace writes only the
 * hash (the path and the query stay as they are, spelled out so a
 * `<base href>` cannot move them) and stores nothing in `history.state`.
 * `popstate` covers Back, Forward and a hash edited in the address bar;
 * `pushState`/`replaceState` never fire it, so a listener hears traversal
 * only. */
export function createHashRouteHistory(win: Window): RouteHistory {
  return {
    current: () => {
      return parseAppRoute(win.location.hash);
    },
    push: (route: AppRoute) => {
      win.history.pushState(null, "", formatRouteUrl(win, route));
    },
    replace: (route: AppRoute) => {
      win.history.replaceState(null, "", formatRouteUrl(win, route));
    },
    subscribe: (listener: (route: AppRoute | null) => void) => {
      function announceTraversal(): void {
        listener(parseAppRoute(win.location.hash));
      }

      win.addEventListener("popstate", announceTraversal);

      return () => {
        win.removeEventListener("popstate", announceTraversal);
      };
    },
  };
}

/** The page's own path and query with `route` as the hash. A bare `#/x`
 * would resolve against the document's base URL, not the page's. */
function formatRouteUrl(win: Window, route: AppRoute): string {
  return win.location.pathname + win.location.search + formatAppRoute(route);
}
