import { isObservable, Observable } from "rxjs";

import type { AppPorts } from "@rtc/core-api";

/**
 * The ports as `createApp` uses them: every stream a port hands out is cut
 * when `lifetime` aborts, whoever still holds it. `dispose()` then means
 * "this composition holds no port", by construction: a presenter stream a
 * consumer never released (an inspector, a leaked subscription) goes quiet
 * and its port subscription is released, and a stream first subscribed
 * after `dispose()` never opens a port at all.
 *
 * A cut stream is silent, not completed: a consumer that outlives the
 * composition hears nothing more, as on the Effect core. Everything else a
 * port returns (a promise, a value, nothing) passes through untouched.
 */
export function cutPortsOnAbort(
  ports: AppPorts,
  lifetime: AbortSignal,
): AppPorts {
  // One abort listener for the whole composition, however many port
  // streams are open: each open stream registers its release here.
  const releases = new Set<() => void>();

  lifetime.addEventListener(
    "abort",
    () => {
      for (const release of [...releases]) {
        release();
      }
    },
    { once: true },
  );

  const cut: Record<string, unknown> = {};

  for (const [name, port] of Object.entries(ports)) {
    cut[name] =
      typeof port === "object" && port !== null
        ? cutPort(port, { lifetime, releases })
        : port;
  }

  return cut as unknown as AppPorts;
}

interface Cut {
  readonly lifetime: AbortSignal;
  readonly releases: Set<() => void>;
}

function cutPort<P extends object>(port: P, cut: Cut): P {
  return new Proxy(port, {
    get: (target: P, key: string | symbol): unknown => {
      // Read and called on the port itself, so a class-based adapter keeps
      // its own `this`.
      const member: unknown = Reflect.get(target, key, target);

      if (typeof member !== "function") {
        return cutIfStream(member, cut);
      }

      return (...args: unknown[]): unknown => {
        return cutIfStream(Reflect.apply(member, target, args), cut);
      };
    },
  });
}

function cutIfStream(value: unknown, cut: Cut): unknown {
  return isObservable(value) ? cutOnAbort(value, cut) : value;
}

/** Unsubscribes from the source when the lifetime aborts, without completing
 * the subscriber. Already aborted: the source is never subscribed. */
function cutOnAbort<T>(source: Observable<T>, cut: Cut): Observable<T> {
  return new Observable<T>((subscriber) => {
    if (cut.lifetime.aborted) {
      return undefined;
    }

    const subscription = source.subscribe(subscriber);

    function releaseSource(): void {
      cut.releases.delete(releaseSource);
      subscription.unsubscribe();
    }

    // A source that replays on subscribe can reach a consumer that ends the
    // composition from inside its `next`: the abort is then already past.
    if (cut.lifetime.aborted) {
      subscription.unsubscribe();
      return undefined;
    }

    cut.releases.add(releaseSource);
    return releaseSource;
  });
}
