// packages/client-core-effect/src/presenters/mirrorPort.ts
import { Stream } from "effect";

import type { Stream as CoreStream } from "@rtc/core-api";

import { fromObservable, peek } from "#/bridge/in";
import { type EffectHost, type FoldUpdate, sharedFold } from "#/bridge/out";

/** A replay-current port stream, projected, as a `sharedFold`: each warm
 * period seeds from the port's current value (read synchronously) and then
 * follows the port on a fiber. The RxJS core's
 * `port$().pipe(map(project), shareReplay({ bufferSize: 1, refCount: true }))`
 * — with the Effect fold's one documented difference: equal consecutive
 * projections are conflated. */
export function mirrorPort<T, U>(
  host: EffectHost,
  source: CoreStream<T>,
  fallback: T,
  project: (value: T) => U,
): CoreStream<U> {
  return sharedFold(host, {
    seed: () => {
      return project(peek(source, fallback));
    },
    run: (update: FoldUpdate<U>) => {
      return fromObservable(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return project(value);
          });
        }),
      );
    },
  });
}
