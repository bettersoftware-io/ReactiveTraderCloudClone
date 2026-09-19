import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/solid-bindings";

import { liveMetricsPage } from "#tests/ui/pages/UseLiveMetricsPage";

import { FROZEN_LIVE_METRICS } from "./LiveMetricsContext";

describe("useLiveMetrics (solid)", () => {
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

  it("returns the frozen value and starts no loop under a provider", () => {
    const result = page.mount({
      viewModel: viewModelWith(false),
      liveMetrics: FROZEN_LIVE_METRICS,
    });

    expect(result()).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("publishes fps + tone over the ~1s window", () => {
    const result = page.mount({ viewModel: viewModelWith(false) });

    expect(result().fps).toBeNull();

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }

    expect(result().fps).toBeNull();
    frame(1000);
    expect(result().fps).toBe(60);
    expect(result().fpsTone).toBe("positive");
  });

  // Power-saver's Freeze tier deliberately does NOT pause the meter — the FPS
  // readout is diagnostic instrumentation, exempt from freeze's motion kill.
  // The motion probe recognises the loop by its `rtcDiagnosticRafLoop` marker
  // (tests/browser/motionProbe.ts), so that marker is pinned here too.
  it("keeps sampling under power-saver freeze and marks its loop diagnostic", () => {
    page.mount({ viewModel: viewModelWith(true) });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(
      (rafCb as { rtcDiagnosticRafLoop?: boolean } | null)
        ?.rtcDiagnosticRafLoop,
    ).toBe(true);
  });

  let rafCb: FrameRequestCallback | null;

  function frame(ts: number): void {
    const cb = rafCb;
    rafCb = null;
    cb?.(ts);
  }
});

/** Minimal ViewModel stub. The hook no longer reads the ViewModel at all —
 *  the provider is kept so the freeze test above renders under a
 *  freeze-shaped ViewModel (with `isFreeze` as a real signal, matching
 *  production's `Accessor<boolean>` shape) and pins the diagnostics
 *  exemption. */
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

const page = liveMetricsPage();
