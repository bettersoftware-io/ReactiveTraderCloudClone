import { afterEach, describe, expect, it, vi } from "vitest";

import { reconnect$ } from "@rtc/client-core";

import {
  promiseToStream,
  pushReconnectIntent,
  storeToStateStream,
  topicToStream,
  topicToStreamWithLead,
} from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { sleep } from "#/kernel/sleep";
import { createStore } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";

describe("bridge/out", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("topicToStreamWithLead hands each subscriber the lead value synchronously, before the topic's own", () => {
    const topic = createTopic<number>(
      (signal, publish) => {
        publish(2);
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true },
    );

    const stream = topicToStreamWithLead(topic, () => {
      return { value: 1 };
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
    const none = topicToStreamWithLead(topic, () => {
      return null;
    });
    const later: number[] = [];
    none
      .subscribe((v) => {
        later.push(v);
      })
      .unsubscribe();
    expect(later).toEqual([2]);
  });

  it("promiseToStream runs per subscription, emits the value and completes, and aborts on unsubscribe", async () => {
    let runs = 0;
    let abortedSignal: AbortSignal | undefined;
    const stream = promiseToStream<number>(async (signal) => {
      runs += 1;
      abortedSignal = signal;
      await sleep(10, signal);
      return runs;
    });
    expect(runs).toBe(0);
    const values: number[] = [];
    let completed = false;
    vi.useFakeTimers();
    stream.subscribe({
      next: (v: number) => {
        values.push(v);
      },
      complete: () => {
        completed = true;
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(values).toEqual([1]);
    expect(completed).toBe(true);
    const sub = stream.subscribe();
    sub.unsubscribe();
    expect(abortedSignal?.aborted).toBe(true);
  });

  it("promiseToStream errors the subscriber on a non-abort rejection and stays silent on an abort", async () => {
    const errors: unknown[] = [];
    promiseToStream(async () => {
      throw new Error("rpc");
    }).subscribe({
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
    const silent: unknown[] = [];
    promiseToStream(async () => {
      throw new AbortError();
    }).subscribe({
      error: (e: unknown) => {
        silent.push(e);
      },
      complete: () => {
        silent.push("complete");
      },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(silent).toEqual([]);
  });
});
