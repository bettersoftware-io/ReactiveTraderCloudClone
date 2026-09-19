import { describe, expect, it } from "vitest";

import { reconnect$ } from "@rtc/client-core";

import {
  pushReconnectIntent,
  storeToStateStream,
  topicToStream,
} from "#/bridge/out";
import { createStore } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";

describe("bridge/out", () => {
  it("topicToStream() forwards publishes and tears the topic down on unsubscribe", () => {
    let aborted = false;
    const topic = createTopic<number>(async (signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
    const seen: number[] = [];
    const sub = topicToStream(topic).subscribe((v) => {
      seen.push(v);
    });
    topic.publish(1);
    sub.unsubscribe();
    expect(seen).toEqual([1]);
    expect(aborted).toBe(true);
  });

  it("topicToStream() forwards fail() as a stream error", () => {
    const topic = createTopic<number>(async () => {});
    const errors: unknown[] = [];
    topicToStream(topic).subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);
  });

  it("storeToStateStream() carries the current value synchronously", () => {
    const store = createStore(5);
    const seen: number[] = [];
    const sub = storeToStateStream(store).subscribe((v) => {
      seen.push(v);
    });
    store.set(6);
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });

  it("storeToStateStream() observes a set made while it is still cold", () => {
    const store = createStore(5);
    const stream = storeToStateStream(store);
    store.set(6);
    const seen: number[] = [];
    const sub = stream.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([6]);
    sub.unsubscribe();
  });

  it("storeToStateStream() re-reads the store on every cold → warm cycle", () => {
    const store = createStore(5);
    const stream = storeToStateStream(store);
    const first: number[] = [];
    stream
      .subscribe((v) => {
        first.push(v);
      })
      .unsubscribe();
    store.set(7);
    const second: number[] = [];
    const sub = stream.subscribe((v) => {
      second.push(v);
    });
    expect(first).toEqual([5]);
    expect(second).toEqual([7]);
    sub.unsubscribe();
  });

  it("pushReconnectIntent() lands a 'reconnect' event on the RxJS core's reconnect$ seam", () => {
    const seen: unknown[] = [];
    const sub = reconnect$.subscribe((e) => {
      seen.push(e);
    });
    pushReconnectIntent();
    expect(seen).toEqual([{ type: "reconnect" }]);
    sub.unsubscribe();
  });
});
