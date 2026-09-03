/**
 * Co-located unit test for the "Ambient style" selector row. The shared
 * ui-contract tier (packages/ui-contract/specs/shell/prefs/) covers the
 * cross-framework toggle/segment/close contract; this file covers the
 * React-local REAL row introduced for the Aurora ambient style (v5): the
 * segment reads/writes `useAmbientStyle()` instead of throwaway local state,
 * mirroring the AmbientBackground.test.tsx render-helper pattern (Task 7).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { JARVIS_BRAINS } from "@rtc/domain";

import { preferencesModalPage } from "#tests/ui/pages/PreferencesModalPage";

const page = preferencesModalPage();

afterEach(() => {
  page.unmountAll();
});

describe("PreferencesModal — ambient style row", () => {
  it("shows the current ambient style and switches it", () => {
    const setStyle = vi.fn();
    page.mount({ ambientStyle: "aurora", setAmbientStyle: setStyle });

    expect(page.roleButtonPressed(/aurora/i)).toBe("true");

    page.clickRoleButton(/rays/i);

    expect(setStyle).toHaveBeenCalledWith("rays");
  });

  it("reflects rays as the active option when the current style is rays", () => {
    page.mount({ ambientStyle: "rays" });

    expect(page.roleButtonPressed(/rays/i)).toBe("true");
    expect(page.roleButtonPressed(/aurora/i)).toBe("false");
  });
});

describe("PreferencesModal — JARVIS brain/effort rows", () => {
  it("disables real-model brain options the server isn't currently offering", () => {
    page.mount({ jarvisBrains: ["scripted"] });

    expect(page.isDisabled("pref-segment-jarvisBrain-scripted")).toBe(false);
    expect(page.isDisabled("pref-segment-jarvisBrain-claude-haiku-4-5")).toBe(
      true,
    );
    expect(page.isDisabled("pref-segment-jarvisBrain-claude-sonnet-5")).toBe(
      true,
    );
    expect(page.isDisabled("pref-segment-jarvisBrain-claude-opus-5")).toBe(
      true,
    );
  });

  it("selecting an offered brain calls setBrain", () => {
    const setBrain = vi.fn();
    page.mount({ jarvisBrains: JARVIS_BRAINS, setJarvisBrain: setBrain });

    page.click("pref-segment-jarvisBrain-claude-sonnet-5");

    expect(setBrain).toHaveBeenCalledWith("claude-sonnet-5");
  });

  it("disables the whole effort row when the selected brain is scripted", () => {
    page.mount({ jarvisBrain: "scripted" });

    expect(page.isDisabled("pref-segment-jarvisEffort-low")).toBe(true);
    expect(page.isDisabled("pref-segment-jarvisEffort-medium")).toBe(true);
    expect(page.isDisabled("pref-segment-jarvisEffort-high")).toBe(true);
  });

  it("enables the effort row for a real brain and selecting an effort calls setEffort", () => {
    const setEffort = vi.fn();
    page.mount({ jarvisBrain: "claude-opus-5", setJarvisEffort: setEffort });

    expect(page.isDisabled("pref-segment-jarvisEffort-high")).toBe(false);

    page.click("pref-segment-jarvisEffort-high");

    expect(setEffort).toHaveBeenCalledWith("high");
  });

  it("renders no gate hint while no gate is active", () => {
    page.mount();

    expect(page.exists("pref-segment-jarvisBrain-hint")).toBe(false);
  });

  it("disables a gated brain with a reset-time title, and shows the hint line", () => {
    page.mount({
      jarvisBrains: JARVIS_BRAINS,
      jarvisGate: {
        level: "soft",
        resetsAtMs: 0,
        gated: ["claude-opus-5"],
      },
    });

    expect(page.isDisabled("pref-segment-jarvisBrain-claude-opus-5")).toBe(
      true,
    );
    expect(
      page.attribute("pref-segment-jarvisBrain-claude-opus-5", "title"),
    ).toMatch(/^Budget window/);

    // A brain the gate did NOT remove stays enabled even though a gate is
    // active elsewhere.
    expect(page.isDisabled("pref-segment-jarvisBrain-claude-sonnet-5")).toBe(
      false,
    );

    expect(page.text("pref-segment-jarvisBrain-hint")).toMatch(
      /^Budget window — resets/,
    );
  });
});
