import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { useTickFlash } from "./useTickFlash";

describe("useTickFlash", () => {
  it("returns idle on the first read (no previous value to compare against)", () => {
    createRoot((dispose) => {
      const [value] = createSignal<number | null>(100);
      const flash = useTickFlash(value);

      expect(flash()).toEqual({ flashOn: false, dir: "up" });
      dispose();
    });
  });

  it("flashes up when the value increases", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<number | null>(100);
      const flash = useTickFlash(value);
      flash();

      setValue(101);

      expect(flash()).toEqual({ flashOn: true, dir: "up" });
      dispose();
    });
  });

  it("flashes down when the value decreases", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<number | null>(100);
      const flash = useTickFlash(value);
      flash();

      setValue(99);

      expect(flash()).toEqual({ flashOn: true, dir: "down" });
      dispose();
    });
  });

  it("returns idle on a null -> number transition (no prior value to compare against)", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<number | null>(null);
      const flash = useTickFlash(value);
      flash();

      setValue(100);

      expect(flash()).toEqual({ flashOn: false, dir: "up" });
      dispose();
    });
  });

  it("returns idle on a number -> null transition", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<number | null>(100);
      const flash = useTickFlash(value);
      flash();

      setValue(null);

      expect(flash()).toEqual({ flashOn: false, dir: "up" });
      dispose();
    });
  });

  it("keeps the previous flash object across a read where the value is unchanged", () => {
    createRoot((dispose) => {
      const [value, setValue] = createSignal<number | null>(100);
      const flash = useTickFlash(value);
      flash();

      setValue(101);
      const flashed = flash();

      // Re-reading without any underlying change returns the SAME object.
      expect(flash()).toBe(flashed);
      dispose();
    });
  });
});
