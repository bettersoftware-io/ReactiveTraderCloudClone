import { describe, expect, it, vi } from "vitest";

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

  it("publish() on a cold or reset topic is dropped and leaves no replay", () => {
    const topic = createTopic<number>(async () => {}, { replay: true });

    // Cold: no subscriber has ever started a producer.
    topic.publish(2);
    const beforeAny: number[] = [];
    const stopBeforeAny = topic.subscribe((v) => {
      beforeAny.push(v);
    });
    expect(beforeAny).toEqual([]);
    stopBeforeAny();

    // Reset: fail() dropped every subscriber and ended the run.
    const errors: unknown[] = [];
    const stop = topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);
    topic.publish(1);

    const seen: number[] = [];
    const lateErrors: unknown[] = [];
    const stopLate = topic.subscribe(
      (v) => {
        seen.push(v);
      },
      (e) => {
        lateErrors.push(e);
      },
    );
    expect(seen).toEqual([]);
    expect(lateErrors).toEqual([]);
    stopLate();
    expect(() => {
      stop();
    }).not.toThrow();
  });

  it("fail() resets: the failed subscribers are dropped and the NEXT subscriber starts a fresh producer with no replay", () => {
    let starts = 0;
    const topic = createTopic<number>(
      async (_signal, publish) => {
        starts += 1;
        publish(starts);
      },
      { replay: true },
    );
    const errors: unknown[] = [];
    const stop = topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    expect(starts).toBe(1);
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);

    const values: number[] = [];
    const lateErrors: unknown[] = [];
    const stopLate = topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        lateErrors.push(e);
      },
    );
    // No latched error, no replay of the pre-failure value: a fresh run.
    expect(lateErrors).toEqual([]);
    expect(starts).toBe(2);
    expect(values).toEqual([2]);
    stopLate();
    expect(() => {
      stop();
    }).not.toThrow();
  });

  it("a superseded run's late publish and late failure reach nobody", async () => {
    let release: ((value: number) => void) | undefined;
    let failLate: ((error: unknown) => void) | undefined;
    let runs = 0;
    const topic = createTopic<number>(
      (signal, publish) => {
        runs += 1;
        const mine = runs;
        return new Promise<void>((resolve, reject) => {
          if (mine === 1) {
            release = publish;
            failLate = reject;
          }

          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true },
    );
    const stopFirst = topic.subscribe(() => {});
    stopFirst();
    const values: number[] = [];
    const errors: unknown[] = [];
    const stopSecond = topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        errors.push(e);
      },
    );
    expect(runs).toBe(2);
    release?.(99);
    failLate?.(new Error("stale"));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(values).toEqual([]);
    expect(errors).toEqual([]);
    stopSecond();
  });

  it("a throwing subscriber does not stop delivery to the others; its error is rethrown on a macrotask", () => {
    vi.useFakeTimers();

    try {
      const topic = createTopic<number>(async () => {});
      const seen: number[] = [];
      topic.subscribe(() => {
        throw new Error("subscriber");
      });
      topic.subscribe((v) => {
        seen.push(v);
      });
      expect(() => {
        topic.publish(1);
      }).not.toThrow();
      expect(seen).toEqual([1]);
      expect(() => {
        vi.runAllTimers();
      }).toThrow("subscriber");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a superseded run's own late rejection (independent of abort) reaches nobody", async () => {
    let rejectFirst: ((error: unknown) => void) | undefined;
    let runs = 0;
    const topic = createTopic<number>((_signal, _publish) => {
      runs += 1;

      if (runs === 1) {
        return new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }

      return new Promise<void>(() => {});
    });
    const stopFirst = topic.subscribe(() => {});
    stopFirst();
    const errors: unknown[] = [];
    const stopSecond = topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    expect(runs).toBe(2);
    rejectFirst?.(new Error("late"));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toEqual([]);
    stopSecond();
  });

  it("an error handler that throws during fail() does not stop delivery to the others; its error is rethrown on a macrotask", () => {
    vi.useFakeTimers();

    try {
      const topic = createTopic<number>(async () => {});
      const seen: unknown[] = [];
      topic.subscribe(
        () => {},
        () => {
          throw new Error("handler");
        },
      );
      topic.subscribe(
        () => {},
        (e) => {
          seen.push(e);
        },
      );
      expect(() => {
        topic.fail(new Error("boom"));
      }).not.toThrow();
      expect(seen).toHaveLength(1);
      expect(() => {
        vi.runAllTimers();
      }).toThrow("handler");
    } finally {
      vi.useRealTimers();
    }
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
