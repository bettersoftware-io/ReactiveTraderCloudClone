import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type TickFlash, useTickFlash } from "./useTickFlash";

describe("useTickFlash", () => {
  it("returns idle on the first render (no previous value to compare against)", () => {
    const { result } = renderHook(() => {
      return useTickFlash(100);
    });

    expect(result.current).toEqual({ flashOn: false, dir: "up" });
  });

  it("flashes up when the value increases", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useTickFlash(props.value);
      },
      { initialProps: { value: 100 } },
    );

    rerender({ value: 101 });

    expect(result.current).toEqual({ flashOn: true, dir: "up" });
  });

  it("flashes down when the value decreases", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useTickFlash(props.value);
      },
      { initialProps: { value: 100 } },
    );

    rerender({ value: 99 });

    expect(result.current).toEqual({ flashOn: true, dir: "down" });
  });

  it("returns idle on a null -> number transition (no prior value to compare against)", () => {
    const { result, rerender } = renderHook<TickFlash, HookProps>(
      (props) => {
        return useTickFlash(props.value);
      },
      { initialProps: { value: null } },
    );

    rerender({ value: 100 });

    expect(result.current).toEqual({ flashOn: false, dir: "up" });
  });

  it("returns idle on a number -> null transition", () => {
    const { result, rerender } = renderHook<TickFlash, HookProps>(
      (props) => {
        return useTickFlash(props.value);
      },
      { initialProps: { value: 100 } },
    );

    rerender({ value: null });

    expect(result.current).toEqual({ flashOn: false, dir: "up" });
  });

  it("keeps the previous flash object across a render where the value is unchanged", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => {
        return useTickFlash(props.value);
      },
      { initialProps: { value: 100 } },
    );

    rerender({ value: 101 });

    const flashed = result.current;

    rerender({ value: 101 });

    expect(result.current).toBe(flashed);
  });
});

interface HookProps {
  value: number | null;
}
