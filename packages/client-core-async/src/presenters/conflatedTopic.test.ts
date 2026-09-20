import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConflatedTopic } from "#/presenters/conflatedTopic";

describe("createConflatedTopic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("while calm: leading value at once, the last of a burst at the window's end, then a new window", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    source.next(3);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(99);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([1, 3]);
    // The trailing emission opened a new window: a value now waits again.
    source.next(4);
    expect(seen).toEqual([1, 3]);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1, 3, 4]);
    stop();
  });

  it("while not calm: every value passes at once; values before the flag has spoken are dropped", () => {
    const source = new Subject<number>();
    const calm = new Subject<boolean>();
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(0);
    expect(seen).toEqual([]);
    calm.next(false);
    source.next(1);
    source.next(2);
    expect(seen).toEqual([1, 2]);
    stop();
  });

  it("calm → off drops the open window and its pending value; off → calm starts fresh with a leading value", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    calm.next(false);
    source.next(3);
    expect(seen).toEqual([1, 3]);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1, 3]);
    calm.next(true);
    source.next(4);
    source.next(5);
    expect(seen).toEqual([1, 3, 4]);
    stop();
  });

  it("the last unsubscribe closes the window: nothing is published afterwards, both sources are released", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    stop();
    expect(source.observed).toBe(false);
    expect(calm.observed).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1]);
  });

  it("a source failure fails the topic", async () => {
    const source = new Subject<number>();
    const topic = createConflatedTopic(
      source,
      new BehaviorSubject<boolean>(false),
      100,
    );
    const errors: unknown[] = [];
    topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    source.error(new Error("feed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);
  });
});
