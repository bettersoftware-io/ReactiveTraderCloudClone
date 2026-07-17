import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FROZEN_LIVE_METRICS, LiveMetricsContext } from "./LiveMetricsContext";
import { useLiveMetrics } from "./useLiveMetrics";

describe("useLiveMetrics", () => {
  let rafCb: FrameRequestCallback | null;

  beforeEach(() => {
    rafCb = null;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(performance, "memory");
  });

  // Drive one frame: the mock captured the pending callback; call it with the
  // frame's timestamp, then let the hook re-arm rAF (captures the next callback).
  function frame(ts: number): void {
    const cb = rafCb;
    rafCb = null;
    act(() => {
      cb?.(ts);
    });
  }

  it("returns the frozen value and never starts a loop when a provider is present", () => {
    function Wrapper({ children }: { children: ReactNode }): ReactElement {
      return (
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          {children}
        </LiveMetricsContext.Provider>
      );
    }
    const { result } = renderHook(() => useLiveMetrics(), {
      wrapper: Wrapper,
    });

    expect(result.current).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("starts null, then publishes fps + tone counted over the ~1s window", () => {
    const { result } = renderHook(() => useLiveMetrics());

    expect(result.current.fps).toBeNull();
    expect(result.current.fpsTone).toBe("dim");

    // 59 frames inside the window (elapsed < 1000ms) → no publish yet.
    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    expect(result.current.fps).toBeNull();

    // 60th frame lands the window at exactly 1000ms → publish 60fps.
    frame(1000);
    expect(result.current.fps).toBe(60);
    expect(result.current.fpsTone).toBe("positive");
  });

  it("reports formatted memory when performance.memory is present", () => {
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: { usedJSHeapSize: 260 * 1024 * 1024 },
    });
    const { result } = renderHook(() => useLiveMetrics());

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    frame(1000);

    expect(result.current.mem).toBe("260MB");
  });

  it("reports null memory when performance.memory is unavailable", () => {
    const { result } = renderHook(() => useLiveMetrics());

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    frame(1000);

    expect(result.current.mem).toBeNull();
  });
});
