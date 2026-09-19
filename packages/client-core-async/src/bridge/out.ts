import { state } from "@rx-state/core";
import { Observable } from "rxjs";

import { reconnect$ } from "@rtc/client-core";
import type { StateStream, Stream } from "@rtc/core-api";

import type { Store } from "#/kernel/store";
import type { Topic } from "#/kernel/topic";

/** The only two places in this package that construct an rxjs Observable.
 * Everything upstream is Topics, Stores and AsyncIterables. */
export function topicToStream<T>(topic: Topic<T>): Stream<T> {
  return new Observable<T>((subscriber) => {
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
