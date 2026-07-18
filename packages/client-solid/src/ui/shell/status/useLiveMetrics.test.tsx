import { renderHook } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { createComponent, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

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
        return createComponent(ViewModelContext.Provider, {
          value: viewModelWith(false),
          get children(): JSX.Element {
            return createComponent(LiveMetricsContext.Provider, {
              value: FROZEN_LIVE_METRICS,
              get children(): JSX.Element {
                return props.children;
              },
            });
          },
        });
      },
    });

    expect(result()).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("publishes fps + tone over the ~1s window", () => {
    const { result } = renderHook(useLiveMetrics, {
      wrapper: withPowerSaver(false),
    });

    expect(result().fps).toBeNull();

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }

    expect(result().fps).toBeNull();
    frame(1000);
    expect(result().fps).toBe(60);
    expect(result().fpsTone).toBe("positive");
  });

  // Power-saver's Freeze tier pauses the rAF loop the same way the
  // LiveMetricsContext harness override does — no context override here,
  // just `usePowerSaver().isFreeze` reached through the real ViewModel seam.
  it("never starts the loop and holds the last value when power-saver is frozen", () => {
    const { result } = renderHook(useLiveMetrics, {
      wrapper: withPowerSaver(true),
    });

    expect(result().fps).toBeNull();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    frame(1000);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

interface WrapperProps {
  children: JSX.Element;
}

/** Minimal ViewModel stub — useLiveMetrics only reads `usePowerSaver().isFreeze`.
 *  `isFreeze` is a real Solid signal (matching production's `Accessor<boolean>`
 *  shape), not a plain closure — the hook reads it inside a tracked
 *  `createEffect`, so a plain-function double would still work for these
 *  fixed-value tests, but a signal keeps the double honest with production. */
function viewModelWith(isFreeze: boolean): ViewModel {
  const [freeze] = createSignal(isFreeze);
  return {
    usePowerSaver: () => {
      return {
        level: () => {
          return isFreeze ? "freeze" : "off";
        },
        isCalm: freeze,
        isFreeze: freeze,
        setLevel: vi.fn(),
        cycle: vi.fn(),
      };
    },
  } as unknown as ViewModel;
}

function withPowerSaver(
  isFreeze: boolean,
): (props: WrapperProps) => JSX.Element {
  return function Wrapper(props: WrapperProps): JSX.Element {
    return createComponent(ViewModelContext.Provider, {
      value: viewModelWith(isFreeze),
      get children(): JSX.Element {
        return props.children;
      },
    });
  };
}
