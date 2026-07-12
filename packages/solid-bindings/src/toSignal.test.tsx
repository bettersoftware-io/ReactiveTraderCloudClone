import { state } from "@rx-state/core";
import { Subject } from "rxjs";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";

import { toSignal } from "#/toSignal";

describe("toSignal", () => {
  it("reads a warm value synchronously on first read", () => {
    const src = new Subject<number>();
    const st = state(src, 0);
    createRoot((dispose) => {
      const value = toSignal(st);
      expect(value()).toBe(0); // default served synchronously — no undefined frame
      src.next(42);
      expect(value()).toBe(42);
      dispose();
    });
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

  it("holds function-shaped state values without invoking them", () => {
    const src = new Subject<() => string>();
    const st = state(src, () => {
      return "a";
    });
    createRoot((dispose) => {
      const value = toSignal(st);
      src.next(() => {
        return "b";
      });
      expect(value()()).toBe("b"); // setValue(() => v) wrapper, not updater misfire
      dispose();
    });
  });
});
