// packages/client-core-effect/src/presenters/mirrorPort.ts
import { Option, Stream } from "effect";

import type { Stream as CoreStream } from "@rtc/core-api";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { peekCurrent } from "#/bridge/peek";

export interface MirrorOptions {
  /** Keep the period across zero subscribers (`SharedFold.retain`). */
  readonly retain?: boolean;
}

/** A replay-current port stream, projected, as a `sharedFold`: each warm
 * period seeds from the port's current value (read synchronously) and then
 * follows the port on a fiber, through the period's own `fromPort`. The
 * RxJS core's
 * `port$().pipe(map(project), shareReplay({ bufferSize: 1, refCount: true }))`
 * — with two documented differences: equal consecutive projections are
 * conflated, and a port that does not emit on subscribe seeds `None`, so
 * subscribers hear nothing until its first value. */
export function mirrorPort<T, U>(
  host: EffectHost,
  source: CoreStream<T>,
  project: (value: T) => U,
  options: MirrorOptions = {},
): CoreStream<U> {
  return sharedFold(host, {
    retain: options.retain,
    seed: () => {
      return Option.map(peekCurrent(source), project);
    },
    run: (update: FoldUpdate<U>, fromPort: FromPort) => {
      return fromPort(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return project(value);
          });
        }),
      );
    },
  });
}

/** A port stream followed WITHOUT a seed peek: a seedless `sharedFold`
 * whose producer is one `fromPort`. For a keyed wire stream — `mirrorPort`'s
 * `peekCurrent` is a subscribe + unsubscribe, which on a server-refcounted
 * per-symbol stream is subscribe/unsubscribe/subscribe on the wire at the
 * start of every warm period. The price: the first value arrives a fiber
 * hop after subscribe, never in the caller's tick. A late joiner still
 * replays the latest synchronously; equal consecutive values conflate. */
export function followPort<T>(
  host: EffectHost,
  source: CoreStream<T>,
): CoreStream<T> {
  return sharedFold(host, {
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<T>, fromPort: FromPort) => {
      return fromPort(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return value;
          });
        }),
      );
    },
  });
}

/** `mirrorPort` with the identity projection: the port's own values,
 * unchanged — what most preference streams are. Same seed, same producer,
 * same notes as `mirrorPort`. */
export function mirrorPortAsIs<T>(
  host: EffectHost,
  source: CoreStream<T>,
  options: MirrorOptions = {},
): CoreStream<T> {
  return mirrorPort(
    host,
    source,
    (value) => {
      return value;
    },
    options,
  );
}
