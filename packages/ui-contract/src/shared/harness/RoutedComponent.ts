import { formatAppRoute } from "@rtc/core-logic";

import { MountedComponent } from "./MountedComponent";

/**
 * A page that can read and step the world's fake page history: the three
 * methods the routing specs share, for the login screen and the whole shell.
 * Each needs the mount to have been seeded with `routePath`.
 */
export abstract class RoutedComponent<P> extends MountedComponent<P> {
  /** Every history write the page made, in order, as `push /x` /
   * `replace /x`. */
  routeWrites(): readonly string[] {
    return this.routeHistory().writes;
  }

  /** Lands the history on `path`, as Back or Forward would, and applies the
   * re-render it causes. */
  traverse(path: string): Promise<void> {
    return this.flushAsync(() => {
      this.routeHistory().traverse(path);

      return Promise.resolve();
    });
  }

  /** The path the history holds now, or null when it names no route. */
  routePath(): string | null {
    const route = this.routeHistory().current();

    return route === null ? null : formatAppRoute(route);
  }
}
