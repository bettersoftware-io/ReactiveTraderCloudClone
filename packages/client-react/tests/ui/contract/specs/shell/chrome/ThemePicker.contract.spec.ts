import { ThemePicker } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  // The ThemeProvider publishes the live skin/mode on the document root; reset
  // both so each spec starts from a clean global state (mirrors ThemeToggle).
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.skin;
});

afterEach(() => {
  return cleanupMounted();
});

describe("ThemePicker", () => {
  it("lists every skin and selecting one writes it through the skin seam", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });
    expect(picker.skinOptions()).toEqual([
      "classic",
      "holo",
      "terminal",
      "neon",
    ]);
    expect(picker.activeSkin()).toBe("holo");

    await picker.selectSkin("neon");
    expect(picker.activeSkin()).toBe("neon");
    expect(picker.documentSkin()).toBe("neon");
  });

  it("cycles mode through the reused ThemeToggle seam", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });
    expect(picker.documentMode()).toBe("dark");
    expect(picker.modeAriaLabel()).toMatch(/switch to light theme/i);

    await picker.toggleMode();
    expect(picker.documentMode()).toBe("light");
    expect(picker.modeAriaLabel()).toMatch(/switch to system theme/i);
  });
});
