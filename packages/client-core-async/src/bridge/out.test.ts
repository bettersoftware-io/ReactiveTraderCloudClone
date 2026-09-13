import { describe, expect, it } from "vitest";

import { storeToStateStream, topicToStream } from "#/bridge/out";
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
});
