import { describe, expect, it } from "vitest";

import {
  mountThemeProvider,
  renderThemeHook,
} from "#tests/ui/pages/UseThemePage";

import { themeTokens } from "./tokens";

describe("useTheme", () => {
  it("throws when rendered outside a ThemeProvider", () => {
    expect(() => {
      renderThemeHook();
    }).toThrow("useTheme must be used within ThemeProvider");
  });
});

describe("ThemeProvider", () => {
  it("writes dataset.skin/dataset.mode and paints the skin×mode tokens on :root", () => {
    mountThemeProvider("holo");

    const root = document.documentElement;
    expect(root.dataset.skin).toBe("holo");
    expect(root.dataset.mode).toBe("dark");
    expect(
      getComputedStyle(root).getPropertyValue("--accent-primary").trim(),
    ).toBe(themeTokens.holo.dark["--accent-primary"]);
  });
});
