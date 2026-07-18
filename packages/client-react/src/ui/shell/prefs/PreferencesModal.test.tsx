/**
 * Co-located unit test for the "Ambient style" selector row. The shared
 * ui-contract tier (packages/ui-contract/specs/shell/prefs/) covers the
 * cross-framework toggle/segment/close contract; this file covers the
 * React-local REAL row introduced for the Aurora ambient style (v5): the
 * segment reads/writes `useAmbientStyle()` instead of throwaway local state,
 * mirroring the AmbientBackground.test.tsx render-helper pattern (Task 7).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AmbientStyle } from "@rtc/domain";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { PreferencesModal } from "./PreferencesModal";

afterEach(() => {
  cleanup();
});

describe("PreferencesModal — ambient style row", () => {
  it("shows the current ambient style and switches it", () => {
    const setStyle = vi.fn();
    renderModal({ ambientStyle: "aurora", setAmbientStyle: setStyle });

    expect(
      screen
        .getByRole("button", { name: /aurora/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    const rays = screen.getByRole("button", { name: /rays/i });
    fireEvent.click(rays);

    expect(setStyle).toHaveBeenCalledWith("rays");
  });

  it("reflects rays as the active option when the current style is rays", () => {
    renderModal({ ambientStyle: "rays" });

    expect(
      screen
        .getByRole("button", { name: /rays/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /aurora/i })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

interface RenderModalOptions {
  ambientStyle?: AmbientStyle;
  setAmbientStyle?: (style: AmbientStyle) => void;
}

function renderModal(
  options: RenderModalOptions = {},
): ReturnType<typeof render> {
  const { ambientStyle = "aurora", setAmbientStyle = vi.fn() } = options;
  const hooks = {
    useAnimatedBackground: () => {
      return { enabled: true, toggle: vi.fn() };
    },
    usePowerSaver: () => {
      return { enabled: false, toggle: vi.fn() };
    },
    useAmbientStyle: () => {
      return { style: ambientStyle, setStyle: setAmbientStyle };
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>
      <PreferencesModal open onClose={() => {}} />
    </ViewModelContext.Provider>,
  );
}
