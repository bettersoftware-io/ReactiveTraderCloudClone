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
  it("keeps the skin dropdown closed until the trigger opens it", () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });
    expect(picker.isMenuOpen()).toBe(false);
  });

  it("lists every skin in the open dropdown and selecting one writes it through the skin seam, closing the menu", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });

    await picker.openMenu();
    expect(picker.isMenuOpen()).toBe(true);
    expect(picker.skinOptions()).toEqual([
      "classic",
      "holo",
      "holo3d",
      "terminal",
      "terminal3d",
      "neon",
    ]);
    expect(picker.activeSkin()).toBe("holo");

    await picker.selectSkin("neon");
    expect(picker.isMenuOpen()).toBe(false);
    expect(picker.documentSkin()).toBe("neon");
  });

  it("selecting a 3d skin writes it through the skin seam", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });

    await picker.openMenu();
    await picker.selectSkin("holo3d");
    expect(picker.isMenuOpen()).toBe(false);
    expect(picker.documentSkin()).toBe("holo3d");
  });

  it("closes the dropdown on Escape without changing the skin", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });

    await picker.openMenu();
    expect(picker.isMenuOpen()).toBe(true);

    await picker.closeMenuWithEscape();
    expect(picker.isMenuOpen()).toBe(false);
    expect(picker.documentSkin()).toBe("holo");
  });

  it("keeps the dropdown open on a non-Escape key press", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });

    await picker.openMenu();
    expect(picker.isMenuOpen()).toBe(true);

    await picker.pressNonEscapeKey();
    expect(picker.isMenuOpen()).toBe(true);
    expect(picker.documentSkin()).toBe("holo");
  });

  it("closes the dropdown on an outside click without changing the skin", async () => {
    const picker = mount(ThemePicker, { themeSkin: "holo", themeMode: "dark" });

    await picker.openMenu();
    expect(picker.isMenuOpen()).toBe(true);

    await picker.closeMenuWithOutsideClick();
    expect(picker.isMenuOpen()).toBe(false);
    expect(picker.documentSkin()).toBe("holo");
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
