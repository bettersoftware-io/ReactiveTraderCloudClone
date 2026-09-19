/** A port fake whose call count for one method is observable. */
export interface CountingPort<P> {
  port: P;
  calls(): number;
}

/** Wraps `port` so every call to `method` is counted — a Proxy rather than a
 * spread, since a class port's methods live on its prototype and a spread
 * would drop them. The `get` trap only INSTALLS the counting wrapper on the
 * method's function-valued property; the count happens inside that wrapper,
 * on invocation — so a property read that is never called does not count —
 * and every other property read falls straight through to `Reflect.get`.
 * Shared by the three port-discipline
 * tests (`ThemePreferencePresenter`, `BootPreferencePresenter`,
 * `EqWatchlistSortPreferencePresenter`) that each assert their presenter
 * calls its one preferences-port method once, however many times the
 * presenter's read (`cycle()`/`current()`) runs. */
export function createCountingPort<P extends object, K extends keyof P>(
  port: P,
  method: K,
): CountingPort<P> {
  let count = 0;
  const proxied = new Proxy(port, {
    get: (target: P, prop: string | symbol, receiver: unknown): unknown => {
      const value = Reflect.get(target, prop, receiver);

      if (prop === method && typeof value === "function") {
        return (...args: unknown[]) => {
          count += 1;
          return Reflect.apply(
            value as (...a: unknown[]) => unknown,
            target,
            args,
          );
        };
      }

      return value;
    },
  });
  return {
    port: proxied,
    calls: () => {
      return count;
    },
  };
}
