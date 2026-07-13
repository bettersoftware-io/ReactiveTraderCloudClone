/**
 * Co-located regression test for the run-once frozen-read trap: the
 * `--amb-play` custom property is the SOLE driver of animation-play-state on
 * all five aurora layers (AmbientBackground.module.css — `data-animated` has
 * no CSS selector), so it must stay REACTIVE to the animated-background
 * preference, not be captured once at mount. The preference double is a real
 * Solid signal (same harness rule as BootSequence.test.tsx): a plain-function
 * double is invisible to Solid's tracking and would mask exactly this bug.
 */
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { AmbientBackground } from "./AmbientBackground";

describe("AmbientBackground — animated-background preference", () => {
  it("flips --amb-play (and data-animated) live when the preference toggles after mount", () => {
    const [enabled, setEnabled] = createSignal(false);
    const hooks = {
      useAnimatedBackground: () => {
        return { enabled, setEnabled: vi.fn(), toggle: vi.fn() };
      },
    } as unknown as ViewModel;

    const { getByTestId } = render(() => {
      return (
        <ViewModelContext.Provider value={hooks}>
          <AmbientBackground />
        </ViewModelContext.Provider>
      );
    });

    const el = getByTestId("ambient-background");
    expect(el.style.getPropertyValue("--amb-play")).toBe("paused");
    expect(el.getAttribute("data-animated")).toBe("false");

    // Toggle ON after mount — the layers must start drifting.
    setEnabled(true);
    expect(el.style.getPropertyValue("--amb-play")).toBe("running");
    expect(el.getAttribute("data-animated")).toBe("true");

    // And back OFF — they must pause again.
    setEnabled(false);
    expect(el.style.getPropertyValue("--amb-play")).toBe("paused");
    expect(el.getAttribute("data-animated")).toBe("false");
  });
});
