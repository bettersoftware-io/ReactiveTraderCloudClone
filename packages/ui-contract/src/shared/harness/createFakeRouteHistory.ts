import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The harness's `RouteHistory`: the page's history without a browser. */
export interface FakeRouteHistory extends RouteHistory {
  /** Every push and replace, in order, as `push #/x` / `replace #/x`. */
  readonly writes: string[];
  /** The hash the history holds now (what the address bar would show). */
  hash(): string;
  /** Simulates Back/Forward (or an edited hash) landing on `hash`. */
  traverse(hash: string): void;
}

export function createFakeRouteHistory(initialHash = ""): FakeRouteHistory {
  let hash = initialHash;
  const writes: string[] = [];
  const listeners = new Set<(route: AppRoute | null) => void>();

  return {
    writes,
    hash: (): string => {
      return hash;
    },
    current: (): AppRoute | null => {
      return parseAppRoute(hash);
    },
    push: (route: AppRoute): void => {
      hash = formatAppRoute(route);
      writes.push(`push ${hash}`);
    },
    replace: (route: AppRoute): void => {
      hash = formatAppRoute(route);
      writes.push(`replace ${hash}`);
    },
    subscribe: (listener: (route: AppRoute | null) => void): (() => void) => {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
    traverse: (next: string): void => {
      hash = next;

      for (const listener of [...listeners]) {
        listener(parseAppRoute(next));
      }
    },
  };
}
