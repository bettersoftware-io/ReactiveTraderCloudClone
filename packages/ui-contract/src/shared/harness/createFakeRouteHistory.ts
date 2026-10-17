import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The harness's `RouteHistory`: the page's history without a browser. */
export interface FakeRouteHistory extends RouteHistory {
  /** Every push and replace, in order, as `push /x` / `replace /x`. */
  readonly writes: string[];
  /** The path the history holds now (what the address bar would show). */
  path(): string;
  /** Simulates Back/Forward landing on `path`. */
  traverse(path: string): void;
}

export function createFakeRouteHistory(initialPath = ""): FakeRouteHistory {
  let path = initialPath;
  const writes: string[] = [];
  const listeners = new Set<(route: AppRoute | null) => void>();

  return {
    writes,
    path: (): string => {
      return path;
    },
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
