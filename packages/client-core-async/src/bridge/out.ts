import { state } from "@rx-state/core";
import { Observable } from "rxjs";

import { reconnect$ } from "@rtc/client-core";
import type { StateStream, Stream } from "@rtc/core-api";

import type { Peeked } from "#/bridge/in";
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

export function storeToStateStream<S>(store: Store<S>): StateStream<S> {
  const changes = new Observable<S>((subscriber) => {
    return store.subscribe((value) => {
      subscriber.next(value);
    });
  });
  return state(changes, store.get());
}

/** Push the user's reconnect intent into the RxJS core's module-level
 * `reconnect$`. Both web clients' `buildBrowserPorts` merge that Subject into
 * `connectionEvents` for EVERY core, so a native `commands.reconnect` has to
 * speak to it or be unobservable in the browser. It is a Subject, which is
 * why the call lives in the bridge; slice 8 moves the seam out of
 * `@rtc/client-core` and this becomes the core's own topic. */
export function pushReconnectIntent(): void {
  reconnect$.next({ type: "reconnect" });
}
