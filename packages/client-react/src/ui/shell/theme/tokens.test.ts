import { describe, expect, it } from "vitest";

import { THEME_MODES, THEME_SKINS } from "@rtc/domain";

import { type ThemeTokens, themeTokens } from "./tokens";

const REQUIRED_KEYS: readonly (keyof ThemeTokens)[] = [
  "--bg-primary",
  "--accent-primary",
  "--accent-2",
  "--border-strong",
  "--panel",
  "--panel-head",
  "--panel-blur",
  "--glow",
  "--grid",
  "--chip",
  "--aurora-a",
  "--aurora-b",
  "--aurora-opacity",
  "--font-display",
  "--font-mono",
  "--tile",
  "--tile-shadow",
  "--panel-shadow",
  "--font-logo",
];

describe("themeTokens skin×mode store", () => {
  it("defines every skin×mode combination", () => {
    for (const skin of THEME_SKINS)
      for (const mode of THEME_MODES)
        expect(themeTokens[skin][mode]).toBeDefined();
  });

  it("every combination supplies the full token surface", () => {
    for (const skin of THEME_SKINS)
      for (const mode of THEME_MODES)
        for (const key of REQUIRED_KEYS)
          expect(themeTokens[skin][mode][key]).toBeTruthy();
  });

  it("every cell supplies the exact same full key surface", () => {
    const reference = Object.keys(themeTokens.holo.dark).sort();
    for (const skin of THEME_SKINS)
      for (const mode of THEME_MODES)
        expect(Object.keys(themeTokens[skin][mode]).sort()).toEqual(reference);
  });

  it("holo dark carries the prototype cyan accent + glass blur", () => {
    expect(themeTokens.holo.dark["--accent-primary"]).toBe("#00e5ff");
    expect(themeTokens.holo.dark["--panel-blur"]).toBe("14px");
  });

  it("terminal is solid (no blur, no glow)", () => {
    expect(themeTokens.terminal.dark["--panel-blur"]).toBe("0");
    expect(themeTokens.terminal.dark["--glow"]).toBe("none");
  });

  it("classic preserves the pre-redesign accent and stays neutral on new keys", () => {
    expect(themeTokens.classic.dark["--accent-primary"]).toBe("#3b82f6");
    expect(themeTokens.classic.dark["--panel-blur"]).toBe("0");
    expect(themeTokens.classic.dark["--glow"]).toBe("none");
  });

  it("v2 tile surfaces: every non-classic dark skin has a gradient tile + layered shadow", () => {
    for (const skin of ["holo", "terminal", "neon"] as const) {
      expect(themeTokens[skin].dark["--tile"]).toContain("linear-gradient");
      expect(themeTokens[skin].dark["--tile-shadow"]).toContain("inset");
    }
  });

  it("classic keeps neutral values for the new keys", () => {
    for (const mode of ["dark", "light"] as const) {
      expect(themeTokens.classic[mode]["--tile"]).toBe("var(--bg-tile)");
      expect(themeTokens.classic[mode]["--tile-shadow"]).toBe("none");
      expect(themeTokens.classic[mode]["--panel-shadow"]).toBe("none");
    }
  });

  it("v2 light palettes are the prototype's, not derived", () => {
    expect(themeTokens.holo.light["--accent-primary"]).toBe("#0096b3");
    expect(themeTokens.terminal.light["--accent-primary"]).toBe("#b67700");
    expect(themeTokens.neon.light["--accent-primary"]).toBe("#c800a0");
  });
});
