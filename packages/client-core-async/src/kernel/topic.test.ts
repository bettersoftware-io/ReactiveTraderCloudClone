import { describe, expect, it } from "vitest";

import { createTopic, mapTopic } from "#/kernel/topic";

describe("Topic", () => {
  it("starts the producer on the first subscriber and aborts it on the last unsubscribe", () => {
    let starts = 0;
    let aborted = false;
    const topic = createTopic<number>(async (signal) => {
      starts += 1;
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
    const a = topic.subscribe(() => {});
    const b = topic.subscribe(() => {});
    expect(starts).toBe(1);
    a();
    expect(aborted).toBe(false);
    b();
    expect(aborted).toBe(true);
  });

  it("multicasts publish() to every subscriber and replays the last value to late subscribers when replay is on", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const seenA: string[] = [];
    topic.subscribe((v) => {
      seenA.push(v);
    });
    topic.publish("x");
    const seenB: string[] = [];
    topic.subscribe((v) => {
      seenB.push(v);
    });
    expect(seenA).toEqual(["x"]);
    expect(seenB).toEqual(["x"]);
  });

  it("forgets the replayed value after teardown", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const stop = topic.subscribe(() => {});
    topic.publish("x");
    stop();
    const seen: string[] = [];
    topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([]);
  });

  it("fail() is terminal: a later subscriber gets the error, not a fresh producer", () => {
    let starts = 0;
    const topic = createTopic<number>(async () => {
      starts += 1;
    });
    topic.subscribe(() => {});
    expect(starts).toBe(1);
    topic.fail(new Error("boom"));

    const values: number[] = [];
    const errors: unknown[] = [];
    const stop = topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        errors.push(e);
      },
    );

    // Synchronously, on subscribe — the way `shareReplay` hands a late
    // subscriber the terminal error rather than restarting the source.
    expect(errors).toHaveLength(1);
    expect(values).toEqual([]);
    expect(starts).toBe(1);
    expect(() => {
      stop();
    }).not.toThrow();
  });

  it("fail() is terminal: publish() and fail() afterwards reach nobody", () => {
    const topic = createTopic<number>(async () => {}, { replay: true });
    topic.subscribe(() => {});
    topic.fail(new Error("boom"));

    topic.publish(1);

    const values: number[] = [];
    const errors: unknown[] = [];
    topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        errors.push(e);
      },
    );
    topic.fail(new Error("second"));

    // The post-failure publish was ignored (no replay of 1), and the second
    // fail() did not re-deliver: exactly one error, the original one.
    expect(values).toEqual([]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
  });

  it("fail() is silent for a subscriber that supplied no error handler", () => {
    const topic = createTopic<number>(async () => {});
    topic.subscribe(() => {});
    expect(() => {
      topic.fail(new Error("boom"));
    }).not.toThrow();
  });

  it("fail() delivers the error to every subscriber and ends the topic", () => {
    const topic = createTopic<number>(async () => {});
    const errors: unknown[] = [];
    topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);
  });
});

describe("mapTopic", () => {
  it("projects every publish and hands the current projection to a late subscriber", () => {
    const source = createTopic<number>(async () => {}, { replay: true });
    const doubled = mapTopic(source, (n) => {
      return n * 2;
    });
    const seen: number[] = [];
    const stop = doubled.subscribe((v) => {
      seen.push(v);
    });
    source.publish(1);
    source.publish(2);
    const late: number[] = [];
    const stopLate = doubled.subscribe((v) => {
      late.push(v);
    });
    expect(seen).toEqual([2, 4]);
    expect(late).toEqual([4]);
    stop();
    stopLate();
  });

  it("starts the source's producer on its first subscriber and aborts it on its last", () => {
    let starts = 0;
    let aborted = false;
    const source = createTopic<number>(
      async (signal) => {
        starts += 1;
        signal.addEventListener("abort", () => {
          aborted = true;
        });
      },
      { replay: true },
    );

    const derived = mapTopic(source, (n) => {
      return n;
    });
    const stop = derived.subscribe(() => {});
    expect(starts).toBe(1);
    expect(aborted).toBe(false);
    stop();
    expect(aborted).toBe(true);
  });

  it("fails when the source fails", async () => {
    const source = createTopic<number>(async () => {}, { replay: true });
    const derived = mapTopic(source, (n) => {
      return n;
    });
    const errors: unknown[] = [];
    derived.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    source.fail(new Error("boom"));
    // The producer's rejection round-trips through Promise.race and spawn's
    // .catch before reaching the derived topic's subscribers — a macrotask
    // tick clears all of that in one wait, rather than pinning an exact
    // microtask count to an implementation detail.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
  });
});
