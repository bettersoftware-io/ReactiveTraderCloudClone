import { describe, expect, it } from "vitest";

import { foldTopic } from "#/kernel/foldTopic";
import { createTopic, type Topic } from "#/kernel/topic";

describe("foldTopic", () => {
  it("hands the first subscriber the seed synchronously, then one accumulator per source value", () => {
    const source = createManualSource();
    const sums = foldTopic(source.topic, 0, add);
    const seen: number[] = [];
    const stop = sums.subscribe((v) => {
      seen.push(v);
    });

    expect(seen).toEqual([0]);
    source.push(2);
    source.push(3);
    expect(seen).toEqual([0, 2, 5]);
    stop();
  });

  it("subscribes the source ONCE for two subscribers, and a late subscriber gets the latest accumulator, never the seed", () => {
    const source = createManualSource();
    const sums = foldTopic(source.topic, 0, add);
    const stopFirst = sums.subscribe(() => {});
    source.push(4);
    const late: number[] = [];
    const stopLate = sums.subscribe((v) => {
      late.push(v);
    });

    expect(source.runs()).toBe(1);
    expect(late).toEqual([4]);
    stopFirst();
    stopLate();
  });

  it("without retainUntil the last unsubscribe releases the source and forgets the accumulator", () => {
    const source = createManualSource();
    const sums = foldTopic(source.topic, 0, add);
    const stop = sums.subscribe(() => {});
    source.push(4);
    stop();
    expect(source.live()).toBe(0);

    const again: number[] = [];
    sums.subscribe((v) => {
      again.push(v);
    })();
    expect(again).toEqual([0]);
  });

  it("with retainUntil the run and its accumulator survive zero subscribers until the signal aborts", () => {
    const source = createManualSource();
    const lifetime = new AbortController();
    const sums = foldTopic(source.topic, 0, add, lifetime.signal);
    sums.subscribe(() => {})();
    source.push(7);
    const later: number[] = [];
    const stop = sums.subscribe((v) => {
      later.push(v);
    });

    expect(later).toEqual([7]);
    expect(source.runs()).toBe(1);
    stop();
    expect(source.live()).toBe(1);
    lifetime.abort();
    expect(source.live()).toBe(0);
  });
});

function add(a: number, b: number): number {
  return a + b;
}

/** A pushable topic that counts its producer runs and the live ones. */
interface ManualSource {
  readonly topic: Topic<number>;
  push(value: number): void;
  runs(): number;
  live(): number;
}

function createManualSource(): ManualSource {
  let runs = 0;
  let live = 0;
  const topic = createTopic<number>((signal) => {
    runs += 1;
    live += 1;

    return new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        live -= 1;
        resolve();
      });
    });
  });

  return {
    topic,
    push: (value: number) => {
      topic.publish(value);
    },
    runs: () => {
      return runs;
    },
    live: () => {
      return live;
    },
  };
}
