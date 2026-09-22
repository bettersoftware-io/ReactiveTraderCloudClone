import { Observable } from "rxjs";

/** Live subscriptions to one port stream — the seam witnesses' instrument
 * for "this app holds this port exactly once". Only `live` is comparable
 * across cores: the Effect core's `mirrorPort` PEEKS a port (subscribe,
 * then unsubscribe) before it follows it, so an `opened` count reads 2
 * there and 1 in the async core for the same wiring. And `live` is only
 * meaningful on a source that never completes — a completing one
 * (`of(…)`) tears down on subscribe and reads 0 whether or not anyone
 * asked; reshape such a source with `concat(source, NEVER)`. */
export interface SubscriptionTally {
  live: number;
}

export function createTally(): SubscriptionTally {
  return { live: 0 };
}

/** `port` with every stream `method` returns counted into the tally
 * `tallyFor` picks from the call's arguments. A Proxy, not a spread copy:
 * the simulators keep their methods on a prototype, which a spread would
 * drop. Every other member is passed through, bound to the real port. */
export function countSubscriptions<P extends object>(
  port: P,
  method: keyof P & string,
  tallyFor: (...args: readonly unknown[]) => SubscriptionTally,
  reshape: (source: Observable<unknown>) => Observable<unknown> = passThrough,
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol): unknown => {
      const member: unknown = Reflect.get(target, property, target);

      if (typeof member !== "function") {
        return member;
      }

      if (property !== method) {
        return member.bind(target);
      }

      return (...args: readonly unknown[]): Observable<unknown> => {
        return countInto(
          reshape(member.apply(target, args) as Observable<unknown>),
          tallyFor(...args),
        );
      };
    },
  });
}

/** `source`, with each subscription counted into `tally` for as long as it
 * stays open. */
export function countInto<T>(
  source: Observable<T>,
  tally: SubscriptionTally,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    tally.live += 1;
    const inner = source.subscribe(subscriber);

    return () => {
      tally.live -= 1;
      inner.unsubscribe();
    };
  });
}

function passThrough<T>(source: Observable<T>): Observable<T> {
  return source;
}
