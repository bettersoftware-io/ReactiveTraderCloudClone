import { renderHook } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { createComponent } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FROZEN_LIVE_METRICS, LiveMetricsContext } from "./LiveMetricsContext";
import { useLiveMetrics } from "./useLiveMetrics";

describe("useLiveMetrics (solid)", () => {
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

  function frame(ts: number): void {
    const cb = rafCb;
    rafCb = null;
    cb?.(ts);
  }

  it("returns the frozen value and starts no loop under a provider", () => {
    const { result } = renderHook(useLiveMetrics, {
      wrapper: (props: WrapperProps): JSX.Element => {
        return createComponent(LiveMetricsContext.Provider, {
          value: FROZEN_LIVE_METRICS,
          get children(): JSX.Element {
            return props.children;
          },
        });
      },
    });

    expect(result()).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("publishes fps + tone over the ~1s window", () => {
    const { result } = renderHook(useLiveMetrics);

    expect(result().fps).toBeNull();

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }

    expect(result().fps).toBeNull();
    frame(1000);
    expect(result().fps).toBe(60);
    expect(result().fpsTone).toBe("positive");
  });
});

interface WrapperProps {
  children: JSX.Element;
}
