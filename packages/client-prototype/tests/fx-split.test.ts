import { act, cleanup, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useSplit } from "#/fx/layout/useSplit";

afterEach(cleanup);

describe("useSplit", () => {
  test("dragging the handle moves ratio toward the drag and persists on pointer up", () => {
    const containerRef = stubContainerRef();
    const { result } = renderHook(() => {
      return useSplit({
        storageKey: "t",
        orientation: "v",
        initial: 0.5,
        containerRef,
      });
    });

    expect(result.current.ratio).toBe(0.5);

    act(() => {
      result.current.handleProps.onPointerDown(
        fakePointerEvent({ clientX: 500 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 700, pointerId: 1 }),
      );
    });

    // container width is 1000, so +200px of drag is +0.2 ratio.
    expect(result.current.ratio).toBeCloseTo(0.7);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", { clientX: 700, pointerId: 1 }),
      );
    });

    expect(localStorage.getItem("t")).toBe(String(result.current.ratio));
  });

  test("a large drag clamps to [min, 1-min] instead of running off the edge", () => {
    const containerRef = stubContainerRef();
    const { result } = renderHook(() => {
      return useSplit({
        storageKey: "clamp",
        orientation: "v",
        initial: 0.5,
        containerRef,
      });
    });

    act(() => {
      result.current.handleProps.onPointerDown(
        fakePointerEvent({ clientX: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 100_000, pointerId: 1 }),
      );
    });

    expect(result.current.ratio).toBe(0.85);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", { clientX: 100_000, pointerId: 1 }),
      );
    });

    expect(localStorage.getItem("clamp")).toBe("0.85");
  });

  test("reads a persisted ratio from localStorage on init instead of the initial value", () => {
    localStorage.setItem("persisted", "0.4");
    const containerRef = stubContainerRef();

    const { result } = renderHook(() => {
      return useSplit({
        storageKey: "persisted",
        orientation: "v",
        initial: 0.5,
        containerRef,
      });
    });

    expect(result.current.ratio).toBe(0.4);
  });

  test("clamps an out-of-bounds persisted ratio to [min, 1-min] on init", () => {
    localStorage.setItem("persisted-oob", "0.99");
    const containerRef = stubContainerRef();

    const { result } = renderHook(() => {
      return useSplit({
        storageKey: "persisted-oob",
        orientation: "v",
        initial: 0.5,
        min: 0.15,
        containerRef,
      });
    });

    expect(result.current.ratio).toBe(0.85);
  });
});

function stubContainerRef(): RefObject<HTMLElement | null> {
  const el = {
    getBoundingClientRect: (): DOMRect => {
      return { width: 1000, height: 1000 } as DOMRect;
    },
  } as unknown as HTMLElement;

  return { current: el };
}

interface PointerEventOverrides {
  clientX?: number;
  clientY?: number;
}

function fakePointerEvent(overrides: PointerEventOverrides): ReactPointerEvent {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };

  return {
    currentTarget: target,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...overrides,
  } as unknown as ReactPointerEvent;
}
