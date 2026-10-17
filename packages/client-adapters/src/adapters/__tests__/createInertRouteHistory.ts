import type { RouteHistory } from "@rtc/core-api";

/** A history with nothing in it that never changes: no route, writes
 * dropped, no traversal ever heard. For a test that needs a `RouteHistory`
 * to hand over but drives no navigation. */
export function createInertRouteHistory(): RouteHistory {
  return {
    current: () => {
      return null;
    },
    push: () => {},
    replace: () => {},
    subscribe: () => {
      return () => {};
    },
  };
}
