import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createSyncRef } from "#/bridge/syncRef";

describe("SyncRef", () => {
  it("commits synchronously and notifies listeners at once, replaying the current value on listen", () => {
    const ref = createSyncRef(1);
    const heard: number[] = [];
    const stop = ref.listen((value) => {
      heard.push(value);
    });

    ref.set((n) => {
      return n + 1;
    });
    expect(ref.get()).toBe(2);
    expect(heard).toEqual([1, 2]);
    stop();
    ref.set((n) => {
      return n + 1;
    });
    expect(heard).toEqual([1, 2]);
  });

  it("a listener that reads the ref reads the value it is being told — the commit comes before the notification", () => {
    const ref = createSyncRef(1);
    const read: number[] = [];
    ref.listen(() => {
      read.push(ref.get());
    });

    ref.set(() => {
      return 2;
    });
    expect(read).toEqual([1, 2]);
  });

  it("an unchanged write notifies nobody", () => {
    const ref = createSyncRef("same");
    const heard: string[] = [];
    ref.listen((value) => {
      heard.push(value);
    });

    ref.set((value) => {
      return value;
    });
    expect(heard).toEqual(["same"]);
  });

  it("write() is the same commit as an Effect: nothing changes until it runs, then listeners hear it before it completes", () => {
    const ref = createSyncRef(1);
    const heard: number[] = [];
    ref.listen((value) => {
      heard.push(value);
    });

    const write = ref.write((n) => {
      return n + 1;
    });
    expect(ref.get()).toBe(1);
    Effect.runSync(write);
    expect(ref.get()).toBe(2);
    expect(heard).toEqual([1, 2]);
    // An unchanged write is dropped here too.
    Effect.runSync(
      ref.write((n) => {
        return n;
      }),
    );
    expect(heard).toEqual([1, 2]);
  });

  it("a listener that writes the ref: nobody hears an older value after a newer one, and nobody hears a value twice", () => {
    const ref = createSyncRef(0);
    const first: number[] = [];
    const second: number[] = [];
    ref.listen((value) => {
      first.push(value);

      if (value === 1) {
        ref.set(() => {
          return 2;
        });
      }
    });
    ref.listen((value) => {
      second.push(value);
    });

    ref.set(() => {
      return 1;
    });
    expect(ref.get()).toBe(2);
    expect(first).toEqual([0, 1, 2]);
    // The inner commit told the second listener 2 before the outer loop
    // reached it; the outer loop then stops rather than hand it 1.
    expect(second).toEqual([0, 2]);
  });

  it("stateStream() carries the current value synchronously, then each change before the write returns", () => {
    const ref = createSyncRef(5);
    const seen: number[] = [];
    const sub = ref.stateStream().subscribe((value: number) => {
      seen.push(value);
    });
    expect(seen).toEqual([5]);
    ref.set(() => {
      return 6;
    });
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
    ref.set(() => {
      return 7;
    });
    expect(seen).toEqual([5, 6]);
  });

  it("stateStream() observes a write made while it is still cold", () => {
    const ref = createSyncRef(5);
    const stream = ref.stateStream();
    // Nobody has subscribed yet — the value must still be read per
    // subscription, not frozen at construction.
    ref.set(() => {
      return 6;
    });
    const seen: number[] = [];
    const sub = stream.subscribe((value: number) => {
      seen.push(value);
    });
    expect(seen).toEqual([6]);
    sub.unsubscribe();
  });

  it("stateStream() re-reads the ref on every cold → warm cycle", () => {
    const ref = createSyncRef(5);
    const stream = ref.stateStream();

    const first: number[] = [];
    const firstSub = stream.subscribe((value: number) => {
      first.push(value);
    });
    expect(first).toEqual([5]);
    firstSub.unsubscribe();

    ref.set(() => {
      return 7;
    });

    const second: number[] = [];
    const secondSub = stream.subscribe((value: number) => {
      second.push(value);
    });
    expect(second).toEqual([7]);
    secondSub.unsubscribe();
  });

  it("stateStream(onSubscribe) runs onSubscribe on each zero-to-one subscriber transition, not per subscriber", () => {
    const ref = createSyncRef(1);
    let starts = 0;
    const state$ = ref.stateStream(() => {
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

  it("warm() keeps a cold getValue() current, and release() is idempotent", () => {
    const ref = createSyncRef(1);
    // The contrast that makes the claim non-vacuous: a plain
    // `stateStream()` with nobody subscribed hands back its
    // construction-time value however far the ref has moved.
    const cold = ref.stateStream();
    const warm = ref.warm();
    ref.set(() => {
      return 2;
    });
    expect(cold.getValue()).toBe(1);
    expect(warm.state$.getValue()).toBe(2);
    warm.release();
    warm.release();
    const seen: number[] = [];
    const sub = warm.state$.subscribe((value: number) => {
      seen.push(value);
    });
    expect(seen).toEqual([2]);
    sub.unsubscribe();
  });

  it("a subscriber joining after a commit reads the committed value at once — no fiber step", () => {
    const ref = createSyncRef("initial");
    const warm = ref.warm();
    ref.set(() => {
      return "restored";
    });

    const seen: string[] = [];
    warm.state$
      .subscribe((value) => {
        seen.push(value);
      })
      .unsubscribe();
    expect(seen).toEqual(["restored"]);
    warm.release();
  });
});
