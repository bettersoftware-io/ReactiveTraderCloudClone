import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

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
    function Wrapper({ children }: WrapperProps): ReactElement {
      return (
        <ViewModelContext.Provider value={viewModelWith(false)}>
          <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
            {children}
          </LiveMetricsContext.Provider>
        </ViewModelContext.Provider>
      );
    }

    const { result } = renderHook(
      () => {
        return useLiveMetrics();
      },
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  // Power-saver's Freeze tier pauses the rAF loop the same way the
  // LiveMetricsContext harness override does — no context override here,
  // just `usePowerSaver().isFreeze` reached through the real ViewModel seam.
  it("never starts the loop and holds the last value when power-saver is frozen", () => {
    const { result, rerender } = renderHook(
      () => {
        return useLiveMetrics();
      },
      { wrapper: withPowerSaver(true) },
    );

    expect(result.current.fps).toBeNull();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    rerender();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("starts null, then publishes fps + tone counted over the ~1s window", () => {
    const { result } = renderHook(
      () => {
        return useLiveMetrics();
      },
      { wrapper: withPowerSaver(false) },
    );

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
    const { result } = renderHook(
      () => {
        return useLiveMetrics();
      },
      { wrapper: withPowerSaver(false) },
    );

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }

    frame(1000);

    expect(result.current.mem).toBe("260MB");
  });

  it("reports null memory when performance.memory is unavailable", () => {
    const { result } = renderHook(
      () => {
        return useLiveMetrics();
      },
      { wrapper: withPowerSaver(false) },
    );

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }

    frame(1000);

    expect(result.current.mem).toBeNull();
  });
});

interface WrapperProps {
  children: ReactNode;
}

/** Minimal ViewModel stub — useLiveMetrics only reads `usePowerSaver().isFreeze`. */
function viewModelWith(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return {
        level: isFreeze ? "freeze" : "off",
        isCalm: isFreeze,
        isFreeze,
        setLevel: vi.fn(),
        cycle: vi.fn(),
      };
    },
  } as unknown as ViewModel;
}

function withPowerSaver(isFreeze: boolean) {
  return function Wrapper({ children }: WrapperProps): ReactElement {
    return (
      <ViewModelContext.Provider value={viewModelWith(isFreeze)}>
        {children}
      </ViewModelContext.Provider>
    );
  };
}
