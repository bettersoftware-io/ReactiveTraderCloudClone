/**
 * Co-located unit test for the AmbientBackground Aurora/Rays branch.
 * The shared ui-contract tier (packages/ui-contract/specs/shell/background/)
 * covers the cross-framework animated/power-saver/aria contract; this file
 * covers the React-local render branch introduced for the Aurora ambient
 * style (v5): which `data-layer` group mounts for each `ambientStyle`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { AmbientBackground } from "./AmbientBackground";

afterEach(() => {
  cleanup();
});

describe("AmbientBackground — ambient style branch", () => {
  it("renders the aurora curtains when ambientStyle is aurora", () => {
    renderWithVm(<AmbientBackground />, { ambientStyle: "aurora" });
    const root = screen.getByTestId("ambient-background");
    expect(root.getAttribute("data-ambient-style")).toBe("aurora");
    expect(root.querySelector('[data-layer="aurora-curtains"]')).not.toBeNull();
    expect(root.querySelector('[data-layer="rays"]')).toBeNull();
  });

  it("renders the rays layers when ambientStyle is rays", () => {
    renderWithVm(<AmbientBackground />, { ambientStyle: "rays" });
    const root = screen.getByTestId("ambient-background");
    expect(root.getAttribute("data-ambient-style")).toBe("rays");
    expect(root.querySelector('[data-layer="rays"]')).not.toBeNull();
    expect(root.querySelector('[data-layer="aurora-curtains"]')).toBeNull();
  });

  it("omits both branches' animated layers under power saver, regardless of style", () => {
    renderWithVm(<AmbientBackground />, {
      ambientStyle: "aurora",
      powerSaver: true,
    });
    const root = screen.getByTestId("ambient-background");
    expect(root.querySelector('[data-layer="aurora-curtains"]')).toBeNull();
    expect(root.querySelector('[data-layer="rays"]')).toBeNull();
  });
});

interface RenderWithVmOptions {
  ambientStyle?: "aurora" | "rays";
  animatedBackground?: boolean;
  powerSaver?: boolean;
}

function renderWithVm(
  el: ReactElement,
  options: RenderWithVmOptions = {},
): ReturnType<typeof render> {
  const {
    ambientStyle = "aurora",
    animatedBackground = true,
    powerSaver = false,
  } = options;

  const hooks = {
    useAnimatedBackground: () => {
      return { enabled: animatedBackground };
    },
    usePowerSaver: () => {
      return { isCalm: powerSaver };
    },
    useAmbientStyle: () => {
      return { style: ambientStyle, setStyle: vi.fn() };
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>{el}</ViewModelContext.Provider>,
  );
}
