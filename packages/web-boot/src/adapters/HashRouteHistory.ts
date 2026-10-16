import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The page's history as hash routes. A push or replace writes only the
 * hash (the path and the query stay as they are) and stores nothing in
 * `history.state`. `popstate` covers Back, Forward and a hash edited in the
 * address bar; `pushState`/`replaceState` never fire it, so a listener
 * hears traversal only. */
export function createHashRouteHistory(win: Window): RouteHistory {
  return {
    current: () => {
      return parseAppRoute(win.location.hash);
    },
    push: (route: AppRoute) => {
      win.history.pushState(null, "", formatAppRoute(route));
    },
    replace: (route: AppRoute) => {
      win.history.replaceState(null, "", formatAppRoute(route));
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
