import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The page's history as path routes. A push or replace writes only the
 * path (the query and the fragment carry over) and stores nothing in
 * `history.state`. The path is absolute, so a `<base href>` cannot move it.
 * `popstate` covers Back and Forward; `pushState`/`replaceState` never fire
 * it, so a listener hears traversal only. */
export function createPathRouteHistory(win: Window): RouteHistory {
  return {
    current: () => {
      return parseAppRoute(win.location.pathname);
    },
    push: (route: AppRoute) => {
      win.history.pushState(null, "", formatRouteUrl(win, route));
    },
    replace: (route: AppRoute) => {
      win.history.replaceState(null, "", formatRouteUrl(win, route));
    },
    subscribe: (listener: (route: AppRoute | null) => void) => {
      function announceTraversal(): void {
        listener(parseAppRoute(win.location.pathname));
      }

      win.addEventListener("popstate", announceTraversal);

      return () => {
        win.removeEventListener("popstate", announceTraversal);
      };
    },
  };
}

/** `route` as the path, with the page's query and fragment kept. */
function formatRouteUrl(win: Window, route: AppRoute): string {
  return formatAppRoute(route) + win.location.search + win.location.hash;
}
