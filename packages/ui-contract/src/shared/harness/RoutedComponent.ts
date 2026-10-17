import { formatAppRoute } from "@rtc/core-logic";

import { MountedComponent } from "./MountedComponent";

/**
 * A page that can read and step the world's fake page history: the three
 * methods the routing specs share, for the login screen and the whole shell.
 * Each needs the mount to have been seeded with `routeHash`.
 */
export abstract class RoutedComponent<P> extends MountedComponent<P> {
  /** Every history write the page made, in order, as `push #/x` /
   * `replace #/x`. */
  routeWrites(): readonly string[] {
    return this.routeHistory().writes;
  }

  /** Lands the history on `hash`, as Back or Forward would, and applies the
   * re-render it causes. */
  traverse(hash: string): Promise<void> {
    return this.flushAsync(() => {
      this.routeHistory().traverse(hash);

      return Promise.resolve();
    });
  }

  /** The hash the history holds now, or null when it names no route. */
  routeHash(): string | null {
    const route = this.routeHistory().current();

    return route === null ? null : formatAppRoute(route);
  }
}
