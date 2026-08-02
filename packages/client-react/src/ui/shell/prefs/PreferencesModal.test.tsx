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

import type { AmbientStyle, JarvisBrain, JarvisEffort } from "@rtc/domain";
import { JARVIS_BRAINS } from "@rtc/domain";
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

describe("PreferencesModal — JARVIS brain/effort rows", () => {
  it("disables real-model brain options the server isn't currently offering", () => {
    renderModal({ jarvisBrains: ["scripted"] });

    expect(
      screen.getByTestId("pref-segment-jarvisBrain-scripted"),
    ).not.toHaveProperty("disabled", true);
    expect(
      screen.getByTestId("pref-segment-jarvisBrain-claude-haiku-4-5"),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByTestId("pref-segment-jarvisBrain-claude-sonnet-5"),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByTestId("pref-segment-jarvisBrain-claude-opus-5"),
    ).toHaveProperty("disabled", true);
  });

  it("selecting an offered brain calls setBrain", () => {
    const setBrain = vi.fn();
    renderModal({ jarvisBrains: JARVIS_BRAINS, setJarvisBrain: setBrain });

    fireEvent.click(
      screen.getByTestId("pref-segment-jarvisBrain-claude-sonnet-5"),
    );

    expect(setBrain).toHaveBeenCalledWith("claude-sonnet-5");
  });

  it("disables the whole effort row when the selected brain is scripted", () => {
    renderModal({ jarvisBrain: "scripted" });

    expect(screen.getByTestId("pref-segment-jarvisEffort-low")).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByTestId("pref-segment-jarvisEffort-medium"),
    ).toHaveProperty("disabled", true);
    expect(screen.getByTestId("pref-segment-jarvisEffort-high")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("enables the effort row for a real brain and selecting an effort calls setEffort", () => {
    const setEffort = vi.fn();
    renderModal({ jarvisBrain: "claude-opus-5", setJarvisEffort: setEffort });

    expect(
      screen.getByTestId("pref-segment-jarvisEffort-high"),
    ).not.toHaveProperty("disabled", true);

    fireEvent.click(screen.getByTestId("pref-segment-jarvisEffort-high"));

    expect(setEffort).toHaveBeenCalledWith("high");
  });
});

interface RenderModalOptions {
  ambientStyle?: AmbientStyle;
  setAmbientStyle?: (style: AmbientStyle) => void;
  jarvisBrains?: readonly JarvisBrain[];
  jarvisBrain?: JarvisBrain;
  setJarvisBrain?: (brain: JarvisBrain) => void;
  jarvisEffort?: JarvisEffort;
  setJarvisEffort?: (effort: JarvisEffort) => void;
}

function renderModal(
  options: RenderModalOptions = {},
): ReturnType<typeof render> {
  const {
    ambientStyle = "aurora",
    setAmbientStyle = vi.fn(),
    jarvisBrains = [],
    jarvisBrain = "scripted",
    setJarvisBrain = vi.fn(),
    jarvisEffort = "medium",
    setJarvisEffort = vi.fn(),
  } = options;

  const hooks = {
    useAnimatedBackground: () => {
      return { enabled: true, toggle: vi.fn() };
    },
    usePowerSaver: () => {
      return { level: "off", setLevel: vi.fn() };
    },
    useAmbientStyle: () => {
      return { style: ambientStyle, setStyle: setAmbientStyle };
    },
    useForceBootAnimation: () => {
      return { enabled: false, toggle: vi.fn() };
    },
    // Not exercised here (the shared ui-contract tier covers the login-wait
    // rows for both frameworks) — but the modal destructures it, so a fake
    // that omits it fails to render at all.
    useLoginWaitPreferences: () => {
      return {
        style: "auto",
        setStyle: vi.fn(),
        delay: "off",
        setDelay: vi.fn(),
      };
    },
    useJarvis: () => {
      return {
        state: {
          available: true,
          brains: jarvisBrains,
          effectiveBrain: jarvisBrain,
        },
      };
    },
    useJarvisPreferences: () => {
      return {
        brain: jarvisBrain,
        setBrain: setJarvisBrain,
        effort: jarvisEffort,
        setEffort: setJarvisEffort,
      };
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>
      <PreferencesModal open onClose={() => {}} />
    </ViewModelContext.Provider>,
  );
}
