import { of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { iterate, once } from "#/bridge/in";

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
