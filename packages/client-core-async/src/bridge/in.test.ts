import { BehaviorSubject, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { iterate, once, peek, relay, topicFromObservable } from "#/bridge/in";

describe("bridge/in", () => {
  it("once() resolves with the first emission", async () => {
    await expect(once(of(7, 8))).resolves.toBe(7);
  });

  it("iterate() yields pushed values in order and stops on abort", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = (async () => {
      for await (const v of iterate(source, controller.signal)) {
        seen.push(v);
      }
    })();
    source.next(1);
    source.next(2);
    // A macrotask boundary, NOT a single `await Promise.resolve()`. Each
    // yield/next round trip through an async generator costs several
    // microtask ticks, so one tick delivers only the first value — and
    // `iterate` drops whatever is still queued the moment the signal aborts
    // (the `while (!signal.aborted)` guard), so aborting one tick in would
    // lose the second value and this would assert [1] instead.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    controller.abort();
    await done;
    expect(seen).toEqual([1, 2]);
  });

  it("iterate() DROPS a value queued at the moment of abort", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = (async () => {
      for await (const v of iterate(source, controller.signal)) {
        seen.push(v);
      }
    })();

    source.next(1);
    source.next(2);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(seen).toEqual([1, 2]);

    // Queued but never consumed: the loop is parked on `wake`, and the
    // `while (!signal.aborted)` guard is what it wakes into. Drop-on-abort
    // is the contract, so a drain-shaped refactor must fail here.
    source.next(3);
    controller.abort();
    await done;

    expect(seen).toEqual([1, 2]);
  });

  it("iterate() throws when the source errors", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = (async () => {
      for await (const v of iterate(source, controller.signal)) {
        seen.push(v);
      }
    })();
    source.next(1);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    source.error(new Error("boom"));
    await expect(done).rejects.toThrow("boom");
    expect(seen).toEqual([1]);
  });

  it("iterate() ends when the source completes", async () => {
    const seen: number[] = [];

    for await (const v of iterate(of(1, 2, 3), new AbortController().signal)) {
      seen.push(v);
    }

    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("relay", () => {
  it("hands a replay-current source's value on in the SAME tick as subscribe", () => {
    const source = new BehaviorSubject(1);
    const controller = new AbortController();
    const seen: number[] = [];
    void relay(source, controller.signal, (v) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    source.next(2);
    expect(seen).toEqual([1, 2]);
    controller.abort();
  });

  it("unsubscribes and resolves on abort", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const done = relay(source, controller.signal, () => {});
    expect(source.observed).toBe(true);
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(source.observed).toBe(false);
  });

  it("resolves on source completion and rejects on source error", async () => {
    const controller = new AbortController();
    await expect(
      relay(of(1, 2), controller.signal, () => {}),
    ).resolves.toBeUndefined();
    const boom = new Error("boom");
    await expect(
      relay(
        throwError(() => {
          return boom;
        }),
        controller.signal,
        () => {},
      ),
    ).rejects.toBe(boom);
  });

  it("resolves without subscribing when the signal is already aborted", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      relay(source, controller.signal, () => {}),
    ).resolves.toBeUndefined();
    expect(source.observed).toBe(false);
  });
});

describe("peek", () => {
  it("reads a replay-current source synchronously and leaves nothing warm", () => {
    const source = new BehaviorSubject("a");
    expect(peek(source, "z")).toBe("a");
    expect(source.observed).toBe(false);
  });

  it("returns the fallback for a source that does not emit on subscribe", () => {
    expect(peek(new Subject<string>(), "z")).toBe("z");
  });
});

describe("topicFromObservable", () => {
  it("subscribes the port on the first subscriber, replays synchronously, releases on the last", () => {
    const port = new BehaviorSubject("holo");
    const topic = topicFromObservable(port);
    expect(port.observed).toBe(false);
    const seen: string[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual(["holo"]);
    expect(port.observed).toBe(true);
    port.next("neon");
    const late: string[] = [];
    const stopLate = topic.subscribe((v) => {
      late.push(v);
    });
    expect(late).toEqual(["neon"]);
    stop();
    stopLate();
    expect(port.observed).toBe(false);
  });

  it("fails the topic when the source errors, and latches the error for a later subscriber", async () => {
    const source = new Subject<string>();
    const topic = topicFromObservable(source);
    const errors: unknown[] = [];
    const stop = topic.subscribe(
      () => {},
      (error) => {
        errors.push(error);
      },
    );
    source.error(new Error("boom"));
    // `relay`'s rejection reaches `Topic.fail` through `spawn` — a macrotask
    // boundary, not a plain microtask (mirrors settle() in @rtc/core-contract).
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
    // Topic.fail is terminal: a later subscribe gets the latched error
    // synchronously, no fresh producer.
    const late: unknown[] = [];
    topic.subscribe(
      () => {},
      (error) => {
        late.push(error);
      },
    );
    expect(late).toHaveLength(1);
    stop();
  });
});
