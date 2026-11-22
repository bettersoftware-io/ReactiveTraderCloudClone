import { createRoot, createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";

import { type TickFlash, useTickFlash } from "./useTickFlash";

// The value signal is written from OUTSIDE the root, as an event handler
// would (a write inside the owned scope throws in dev), and each write is
// applied with `flush()` before the flash is read.
describe("useTickFlash", () => {
  it("returns idle on the first read (no previous value to compare against)", () => {
    const { flash, dispose } = mountTickFlash(100);

    expect(flash()).toEqual({ flashOn: false, dir: "up" });
    dispose();
  });

  it("flashes up when the value increases", () => {
    const { flash, setValue, dispose } = mountTickFlash(100);

    setValue(101);
    flush();

    expect(flash()).toEqual({ flashOn: true, dir: "up" });
    dispose();
  });

  it("flashes down when the value decreases", () => {
    const { flash, setValue, dispose } = mountTickFlash(100);

    setValue(99);
    flush();

    expect(flash()).toEqual({ flashOn: true, dir: "down" });
    dispose();
  });

  it("returns idle on a null -> number transition (no prior value to compare against)", () => {
    const { flash, setValue, dispose } = mountTickFlash(null);

    setValue(100);
    flush();

    expect(flash()).toEqual({ flashOn: false, dir: "up" });
    dispose();
  });

  it("returns idle on a number -> null transition", () => {
    const { flash, setValue, dispose } = mountTickFlash(100);

    setValue(null);
    flush();

    expect(flash()).toEqual({ flashOn: false, dir: "up" });
    dispose();
  });

  it("keeps the previous flash object across a read where the value is unchanged", () => {
    const { flash, setValue, dispose } = mountTickFlash(100);

    setValue(101);
    flush();
    const flashed = flash();

    // Re-reading without any underlying change returns the SAME object.
    expect(flash()).toBe(flashed);
    dispose();
  });
});

interface TickFlashMount {
  flash: () => TickFlash;
  setValue: (next: number | null) => void;
  dispose: () => void;
}

/** One `useTickFlash` over a value signal seeded with `initial`, under its
 * own root. */
function mountTickFlash(initial: number | null): TickFlashMount {
  return createRoot((dispose) => {
    const [value, setValue] = createSignal<number | null>(initial);

    return {
      flash: useTickFlash(value),
      setValue: (next: number | null): void => {
        setValue(next);
      },
      dispose,
    };
  });
}
