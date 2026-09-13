import { state } from "@rx-state/core";
import { Observable } from "rxjs";

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
