import type { AppRoute, RouteHistory } from "@rtc/core-api";

import { formatAppRoute, parseAppRoute } from "#/routes/appRoutes";

export interface FakeRouteHistory extends RouteHistory {
  /** Every push and replace, in order, as `push /x` / `replace /x`. */
  readonly writes: string[];
  /** Simulates Back/Forward (or an edited address) landing on `path`. */
  traverse(path: string): void;
}

export function createFakeRouteHistory(initialPath = ""): FakeRouteHistory {
  let path = initialPath;
  const writes: string[] = [];
  const listeners = new Set<(route: AppRoute | null) => void>();

  return {
    writes,
    current: (): AppRoute | null => {
      return parseAppRoute(path);
    },
    push: (route: AppRoute): void => {
      path = formatAppRoute(route);
      writes.push(`push ${path}`);
    },
    replace: (route: AppRoute): void => {
      path = formatAppRoute(route);
      writes.push(`replace ${path}`);
    },
    subscribe: (listener: (route: AppRoute | null) => void): (() => void) => {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
    traverse: (next: string): void => {
      path = next;

      for (const listener of [...listeners]) {
        listener(parseAppRoute(next));
      }
    },
  };
}
