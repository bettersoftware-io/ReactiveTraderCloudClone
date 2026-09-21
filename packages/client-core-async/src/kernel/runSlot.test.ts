import { describe, expect, it, vi } from "vitest";

import { AbortError } from "#/kernel/AbortError";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

describe("createRunSlot", () => {
  it("start() runs the body with a live signal; set() writes the store", async () => {
    const store = createStore("init");
    const slot = createRunSlot(store);
    let sawSignal: AbortSignal | undefined;
    slot.start(async (run) => {
      sawSignal = run.signal;
      run.set("first");
    });
    await flushMicrotasks();
    expect(sawSignal?.aborted).toBe(false);
    expect(store.get()).toBe("first");
  });

  it("a second start() aborts the first run's signal; its later set()/ifCurrent() are then dropped", async () => {
    const store = createStore("init");
    const slot = createRunSlot(store);
    let firstSignal: AbortSignal | undefined;
    let firstIfCurrentRan = false;
    let release: (() => void) | undefined;
    slot.start(async (run) => {
      firstSignal = run.signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      run.set("first-late");
      run.ifCurrent(() => {
        firstIfCurrentRan = true;
      });
    });
    await flushMicrotasks();

    slot.start(async () => {});
    expect(firstSignal?.aborted).toBe(true);

    release?.();
    await flushMicrotasks();

    expect(store.get()).toBe("init");
    expect(firstIfCurrentRan).toBe(false);
  });

  it("closes the post-await stale-write window: a resolution and a superseding start() land in the SAME tick, but set() still never reaches the store", async () => {
    const store = createStore("init");
    const slot = createRunSlot(store);
    let release: (() => void) | undefined;
    slot.start(async (run) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      run.set("stale");
    });
    await flushMicrotasks();

    // Same tick: resolve the awaited promise, then immediately supersede —
    // before the first run's continuation gets its own microtask turn.
    release?.();
    slot.start(async () => {});

    await Promise.resolve();
    await Promise.resolve();

    expect(store.get()).toBe("init");
  });

  it("end() aborts the run in flight without starting a new one", async () => {
    const store = createStore("init");
    const slot = createRunSlot(store);
    let signal: AbortSignal | undefined;
    slot.start(async (run) => {
      signal = run.signal;
    });
    await flushMicrotasks();

    slot.end();
    expect(signal?.aborted).toBe(true);
  });

  it("dispose() aborts the run in flight, makes start() a no-op, and is idempotent; isDisposed() reports it", async () => {
    const store = createStore("init");
    const slot = createRunSlot(store);
    let signal: AbortSignal | undefined;
    slot.start(async (run) => {
      signal = run.signal;
    });
    await flushMicrotasks();

    expect(slot.isDisposed()).toBe(false);
    slot.dispose();
    expect(slot.isDisposed()).toBe(true);
    expect(signal?.aborted).toBe(true);

    let bodyCalled = false;
    slot.start(async () => {
      bodyCalled = true;
    });
    await flushMicrotasks();
    expect(bodyCalled).toBe(false);

    expect(() => {
      slot.dispose();
    }).not.toThrow();
    expect(slot.isDisposed()).toBe(true);
  });

  it("a body that rejects with a non-abort error is reported through reportAsync", async () => {
    vi.useFakeTimers();

    try {
      const store = createStore("init");
      const slot = createRunSlot(store);
      slot.start(async () => {
        throw new Error("bust");
      });
      await flushMicrotasks();
      expect(() => {
        vi.runAllTimers();
      }).toThrow("bust");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an AbortError rejection is silent", async () => {
    vi.useFakeTimers();

    try {
      const store = createStore("init");
      const slot = createRunSlot(store);
      slot.start(async () => {
        throw new AbortError();
      });
      await flushMicrotasks();
      expect(() => {
        vi.runAllTimers();
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  }
});
