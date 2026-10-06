import {
  isObservable,
  type MonoTypeOperatorFunction,
  Observable,
  Subscription,
} from "rxjs";

import type { AppPorts } from "@rtc/core-api";

/**
 * The ports as `createApp` uses them: every stream a port hands out is cut
 * when `disposed$` fires, whoever still holds it. `dispose()` then means
 * "this composition holds no port", by construction: a presenter stream a
 * consumer never released (an inspector, a leaked subscription) goes quiet
 * and its port subscription is released, and a stream first subscribed
 * after `dispose()` never opens a port at all.
 *
 * A cut stream is silent, not completed: a consumer that outlives the
 * composition hears nothing more, as on the Effect core. Everything else a
 * port returns (a promise, a value, nothing) passes through untouched.
 */
export function cutPortsOnDispose(
  ports: AppPorts,
  disposed$: Observable<void>,
): AppPorts {
  const cut: Record<string, unknown> = {};

  for (const [name, port] of Object.entries(ports)) {
    cut[name] =
      typeof port === "object" && port !== null
        ? cutPort(port, disposed$)
        : port;
  }

  return cut as unknown as AppPorts;
}

function cutPort<P extends object>(port: P, disposed$: Observable<void>): P {
  return new Proxy(port, {
    get: (target: P, key: string | symbol): unknown => {
      // Read and called on the port itself, so a class-based adapter keeps
      // its own `this`.
      const member: unknown = Reflect.get(target, key, target);

      if (typeof member !== "function") {
        return cutIfStream(member, disposed$);
      }

      return (...args: unknown[]): unknown => {
        return cutIfStream(Reflect.apply(member, target, args), disposed$);
      };
    },
  });
}

function cutIfStream(value: unknown, disposed$: Observable<void>): unknown {
  return isObservable(value) ? value.pipe(cutWhen(disposed$)) : value;
}

/** Unsubscribes from the source when `disposed$` fires, without completing
 * the subscriber. Already fired: the source is never subscribed. */
function cutWhen<T>(disposed$: Observable<void>): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>): Observable<T> => {
    return new Observable<T>((subscriber) => {
      const cut = new Subscription();

      cut.add(
        disposed$.subscribe(() => {
          cut.unsubscribe();
        }),
      );

      if (!cut.closed) {
        cut.add(source.subscribe(subscriber));
      }

      return cut;
    });
  };
}
