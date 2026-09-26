import { state } from "@rx-state/core";
import { Observable } from "rxjs";

import type { StateStream, Stream } from "@rtc/core-api";

import { type Peeked, relay } from "#/bridge/in";
import { AbortError } from "#/kernel/AbortError";
import type { Store } from "#/kernel/store";
import type { Topic } from "#/kernel/topic";

/** The only places in this package that construct an rxjs Observable.
 * Everything upstream is Topics, Stores, Promises and AsyncIterables. */
export function topicToStream<T>(topic: Topic<T>): Stream<T> {
  return topicToStreamWithLead(topic, () => {
    return null;
  });
}

/** `topicToStream` that first hands each subscriber `lead()`'s value
 * synchronously, when there is one, ahead of the topic's own replay or
 * first value — the RxJS core's `defer(() => shared.pipe(startWith(seed)))`
 * for a remounted price-history window: the retained window paints on the
 * first frame, then the topic continues. A warm topic follows with its
 * replayed value; nothing de-duplicates the two, as nothing does in the
 * RxJS core. */
export function topicToStreamWithLead<T>(
  topic: Topic<T>,
  lead: () => Peeked<T> | null,
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const first = lead();

    if (first !== null) {
      subscriber.next(first.value);
    }

    return topic.subscribe(
      (value) => {
        subscriber.next(value);
      },
      (error) => {
        subscriber.error(error);
      },
    );
  });
}

/** A one-shot command result as a Stream: `run` starts on each subscribe
 * with a signal the unsubscribe aborts; its value is emitted and the stream
 * completes (an RPC result ends — slice 2 ruling 11); a rejection errors the
 * subscriber unless it is the abort itself, which is silence. */
export function promiseToStream<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    run(controller.signal).then(
      (value) => {
        subscriber.next(value);
        subscriber.complete();
      },
      (error: unknown) => {
        if (!(error instanceof AbortError)) {
          subscriber.error(error);
        }
      },
    );

    return () => {
      controller.abort();
    };
  });
}

/** A Store as a `StateStream`. `onSubscribe`, when given, runs each time
 * the stream goes from zero subscribers to one (`@rx-state/core` shares the
 * source) — how a presenter starts a lazy load on its first subscriber, as
 * the RxJS core's `state()` does. */
export function storeToStateStream<S>(
  store: Store<S>,
  onSubscribe: () => void = () => {},
): StateStream<S> {
  const changes = new Observable<S>((subscriber) => {
    onSubscribe();

    return store.subscribe((value) => {
      subscriber.next(value);
    });
  });
  return state(changes, store.get());
}

/** A per-call, multi-value port stream as a Stream — the lifecycle twin of
 * `promiseToStream`: `open` runs on each subscribe (lazy; two subscribers
 * are two port calls, as with the RxJS core's bare port Observable), every
 * value goes through `onValue` first, completion and errors pass through,
 * and an unsubscribe releases the port. */
export function portCallToStream<T>(
  open: () => Stream<T>,
  onValue: (value: T) => void = () => {},
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    relay(open(), controller.signal, (value) => {
      onValue(value);
      subscriber.next(value);
    }).then(
      () => {
        // `relay` also resolves on abort — that is an unsubscribe, not an end.
        if (!controller.signal.aborted) {
          subscriber.complete();
        }
      },
      (error: unknown) => {
        subscriber.error(error);
      },
    );

    return () => {
      controller.abort();
    };
  });
}

/** A `StateStream` and the release of its keep-warm. */
export interface WarmStateStream<S> {
  readonly state$: StateStream<S>;
  release(): void;
}

/** `storeToStateStream` held warm by a subscription of its own, for an
 * app-lifetime singleton: `@rx-state/core` drops a `StateObservable`'s
 * current value at refCount 0, so a cold `getValue()` — what React's
 * `useStateObservable` reads on a first render — would hand back the
 * construction-time default however far the store has moved. The RxJS
 * singletons hold the same internal subscription for the same reason. The
 * `.subscribe()` lives here because the bridge owns rxjs. */
export function storeToWarmStateStream<S>(store: Store<S>): WarmStateStream<S> {
  const state$ = storeToStateStream(store);
  const warm = state$.subscribe();

  return {
    state$,
    release: () => {
      warm.unsubscribe();
    },
  };
}

/** A stream that completes at once without a value — an unsupported desk
 * panel's `data$` (the RxJS presenter's `EMPTY`). */
export function emptyStream<T>(): Stream<T> {
  return new Observable<T>((subscriber) => {
    subscriber.complete();
  });
}
