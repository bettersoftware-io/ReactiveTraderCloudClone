/**
 * Co-located regression test for the run-once frozen-read trap: the
 * `--amb-play` custom property is the SOLE driver of animation-play-state on
 * all five aurora layers (AmbientBackground.module.css — `data-animated` has
 * no CSS selector), so it must stay REACTIVE to the animated-background
 * preference, not be captured once at mount. The preference double is a real
 * Solid signal (same harness rule as BootSequence.test.tsx): a plain-function
 * double is invisible to Solid's tracking and would mask exactly this bug.
 *
 * The second describe block below is the Solid-local counterpart of
 * client-react's AmbientBackground.test.tsx: which `data-layer` group mounts
 * for each `ambientStyle`. The shared ui-contract tier (packages/ui-contract/
 * src/specs/shell/background/) covers the same branch cross-framework; this
 * file covers it once more locally so a Solid-only regression fails fast.
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
    const [level] = createSignal("off");
    const [ambientStyle] = createSignal<"aurora" | "rays">("rays");
    const hooks = {
      useAnimatedBackground: () => {
        return { enabled, setEnabled: vi.fn(), toggle: vi.fn() };
      },
      usePowerSaver: () => {
        return {
          level,
          isCalm: () => {
            return level() !== "off";
          },
          isFreeze: () => {
            return level() === "freeze";
          },
          setLevel: vi.fn(),
          cycle: vi.fn(),
        };
      },
      useAmbientStyle: () => {
        return { style: ambientStyle, setStyle: vi.fn() };
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

describe("AmbientBackground — ambient style branch", () => {
  it("renders the aurora curtains when ambientStyle is aurora", () => {
    const { getByTestId } = renderWithStyle("aurora");
    const root = getByTestId("ambient-background");
    expect(root.getAttribute("data-ambient-style")).toBe("aurora");
    expect(root.querySelector('[data-layer="aurora-curtains"]')).not.toBeNull();
    expect(root.querySelector('[data-layer="rays"]')).toBeNull();
  });

  it("renders the rays layers when ambientStyle is rays", () => {
    const { getByTestId } = renderWithStyle("rays");
    const root = getByTestId("ambient-background");
    expect(root.getAttribute("data-ambient-style")).toBe("rays");
    expect(root.querySelector('[data-layer="rays"]')).not.toBeNull();
    expect(root.querySelector('[data-layer="aurora-curtains"]')).toBeNull();
  });

  it("omits both branches' animated layers under power saver, regardless of style", () => {
    const { getByTestId } = renderWithStyle("aurora", { powerSaver: true });
    const root = getByTestId("ambient-background");
    expect(root.querySelector('[data-layer="aurora-curtains"]')).toBeNull();
    expect(root.querySelector('[data-layer="rays"]')).toBeNull();
  });
});

interface RenderWithStyleOptions {
  animatedBackground?: boolean;
  powerSaver?: boolean;
}

function renderWithStyle(
  style: "aurora" | "rays",
  options: RenderWithStyleOptions = {},
): ReturnType<typeof render> {
  const { animatedBackground = true, powerSaver = false } = options;
  const hooks = {
    useAnimatedBackground: () => {
      return {
        enabled: () => {
          return animatedBackground;
        },
      };
    },
    usePowerSaver: () => {
      return {
        isCalm: () => {
          return powerSaver;
        },
      };
    },
    useAmbientStyle: () => {
      return {
        style: () => {
          return style;
        },
        setStyle: vi.fn(),
      };
    },
  } as unknown as ViewModel;

  return render(() => {
    return (
      <ViewModelContext.Provider value={hooks}>
        <AmbientBackground />
      </ViewModelContext.Provider>
    );
  });
}
