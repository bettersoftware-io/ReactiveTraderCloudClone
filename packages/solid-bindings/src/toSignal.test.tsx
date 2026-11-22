import { state } from "@rx-state/core";
import { Subject } from "rxjs";
import { createEffect, createRoot, flush } from "solid-js";
import { describe, expect, it } from "vitest";

import { toSignal } from "#/toSignal";

describe("toSignal", () => {
  it("reads a warm value synchronously on first read", () => {
    const src = new Subject<number>();
    const st = state(src, 0);
    const { value, dispose } = createRoot((dispose) => {
      return { value: toSignal(st), dispose };
    });

    expect(value()).toBe(0); // default served synchronously — no undefined frame
    src.next(42);
    flush();

    expect(value()).toBe(42);
    dispose();
  });

  it("delivers a burst emitted in one turn as ONE downstream update, carrying the last value", () => {
    const src = new Subject<number>();
    const st = state(src, 0);
    const applied: number[] = [];
    const { dispose } = createRoot((dispose) => {
      const value = toSignal(st);
      createEffect(
        () => {
          return value();
        },
        (v) => {
          applied.push(v);
        },
      );

      return { dispose };
    });
    flush();

    expect(applied).toEqual([0]);
    src.next(1);
    src.next(2);
    src.next(3);
    flush();

    expect(applied).toEqual([0, 3]);
    dispose();
  });

  it("notifies nobody when the source re-emits the same reference", () => {
    const src = new Subject<Counted>();
    const first: Counted = { n: 1 };
    const st = state(src, first);
    const applied: Counted[] = [];
    const { dispose } = createRoot((dispose) => {
      const value = toSignal(st);
      createEffect(
        () => {
          return value();
        },
        (v) => {
          applied.push(v);
        },
      );

      return { dispose };
    });
    flush();
    src.next(first);
    flush();

    expect(applied).toEqual([first]);
    dispose();
  });

  it("unsubscribes on cleanup (refcount drops)", () => {
    const src = new Subject<number>();
    const st = state(src, 0);
    createRoot((dispose) => {
      toSignal(st);
      expect(st.getRefCount()).toBe(1);
      dispose();
    });
    expect(st.getRefCount()).toBe(0);
  });

  it("throws on a cold source and releases its subscription (no leak)", () => {
    const src = new Subject<number>();
    const st = state(src); // no default, never emitted → cold
    createRoot((dispose) => {
      expect(() => {
        toSignal(st);
      }).toThrowError(
        "toSignal requires a warm or defaulted StateObservable (no synchronous emission received)",
      );
      dispose();
    });

    // The eager subscription made before the throw must not leak.
    expect(st.getRefCount()).toBe(0);
  });

  it("holds function-shaped state values without invoking them", () => {
    const src = new Subject<() => string>();
    const st = state(src, () => {
      return "a";
    });

    const { value, dispose } = createRoot((dispose) => {
      return { value: toSignal(st), dispose };
    });

    expect(value()()).toBe("a"); // seeded as a value, not run as a compute
    src.next(() => {
      return "b";
    });
    flush();

    expect(value()()).toBe("b"); // boxed write, not an updater misfire
    dispose();
  });
});

/** A reference-compared value: two `{ n: 1 }` literals are different values. */
interface Counted {
  readonly n: number;
}
