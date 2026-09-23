import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { incident$, reconnect$ } from "@rtc/client-core";

import {
  portCallToStream,
  promiseToStream,
  pushIncidentEvent,
  pushReconnectIntent,
  storeToStateStream,
  storeToWarmStateStream,
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

  it("pushIncidentEvent() lands the event on the RxJS core's incident$ seam", () => {
    const seen: unknown[] = [];
    const sub = incident$.subscribe((e) => {
      seen.push(e);
    });
    pushIncidentEvent({ type: "gatewayDisconnected" });
    expect(seen).toEqual([{ type: "gatewayDisconnected" }]);
    sub.unsubscribe();
  });

  it("storeToStateStream runs onSubscribe on each zero-to-one subscriber transition, not per subscriber", () => {
    let starts = 0;
    const state$ = storeToStateStream(createStore(1), () => {
      starts += 1;
    });
    const a = state$.subscribe(() => {});
    const b = state$.subscribe(() => {});
    expect(starts).toBe(1);
    a.unsubscribe();
    b.unsubscribe();
    state$.subscribe(() => {}).unsubscribe();
    expect(starts).toBe(2);
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

  it("portCallToStream() opens lazily, once per subscription, runs onValue before the subscriber, and completes/errors/releases correctly", () => {
    let opens = 0;
    const sources: Subject<number>[] = [];
    const onValueSeen: number[] = [];
    const subscriberSeen: number[] = [];
    let completedAfterUnsubscribe = false;

    const stream = portCallToStream<number>(
      () => {
        opens += 1;
        const source = new Subject<number>();
        sources.push(source);
        return source;
      },
      (value: number) => {
        onValueSeen.push(value);
      },
    );
    expect(opens).toBe(0);

    // `onValue` must have already run by the time the subscriber sees the
    // value — asserted from inside the subscriber callback itself.
    const sub1 = stream.subscribe({
      next: (v: number) => {
        subscriberSeen.push(v);
        expect(onValueSeen).toEqual(subscriberSeen);
      },
      complete: () => {
        completedAfterUnsubscribe = true;
      },
    });
    expect(opens).toBe(1);
    sources[0]?.next(1);
    expect(onValueSeen).toEqual([1]);
    expect(subscriberSeen).toEqual([1]);

    const sub2 = stream.subscribe(() => {});
    expect(opens).toBe(2);

    expect(sources[0]?.observed).toBe(true);
    sub1.unsubscribe();
    expect(sources[0]?.observed).toBe(false);
    // A late complete after the unsubscribe must not reach the subscriber.
    sources[0]?.complete();
    expect(completedAfterUnsubscribe).toBe(false);
    sub2.unsubscribe();
  });

  it("portCallToStream() defaults onValue to a no-op when omitted", () => {
    const source = new Subject<number>();
    const seen: number[] = [];
    const sub = portCallToStream<number>(() => {
      return source;
    }).subscribe((v: number) => {
      seen.push(v);
    });
    source.next(1);
    expect(seen).toEqual([1]);
    sub.unsubscribe();
  });

  it("portCallToStream() completes on source completion and errors on source failure", async () => {
    const complete$ = new Subject<number>();
    let completed = false;
    portCallToStream<number>(() => {
      return complete$;
    }).subscribe({
      complete: () => {
        completed = true;
      },
    });
    complete$.complete();
    await settleMacrotask();
    expect(completed).toBe(true);

    const fail$ = new Subject<number>();
    const errors: unknown[] = [];
    portCallToStream<number>(() => {
      return fail$;
    }).subscribe({
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    fail$.error(new Error("bust"));
    await settleMacrotask();
    expect(errors).toHaveLength(1);
  });

  it("storeToWarmStateStream() keeps the store's set visible with zero external subscribers, release() is idempotent, and a fresh subscription still yields the current value synchronously", () => {
    const store = createStore(1);
    const warm = storeToWarmStateStream(store);
    store.set(2);
    expect(warm.state$.getValue()).toBe(2);

    warm.release();
    warm.release();

    const seen: number[] = [];
    const sub = warm.state$.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([2]);
    sub.unsubscribe();
  });
});

/** One macrotask turn — `portCallToStream`'s completion/error path runs
 * through `relay`'s promise, which settles a microtask after the source's
 * own notification. */
function settleMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
