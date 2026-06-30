import { describe, expect, it } from "vitest";

import type { Skin, ThemeTokens } from "#/mock/types";
import { tokensToCssVars } from "#/theme/themeVars";
import { themesDark, themesLight } from "#/theme/tokens";

const SKINS: Skin[] = ["holo", "holo3d", "terminal", "terminal3d", "neon"];
const REQUIRED: (keyof ThemeTokens)[] = [
  "bg",
  "bg2",
  "panel",
  "panelHead",
  "border",
  "borderStrong",
  "text",
  "dim",
  "faint",
  "accent",
  "accent2",
  "buy",
  "sell",
  "glow",
  "grid",
  "chip",
  "auroraOp",
  "tile",
  "tileShadow",
  "fontD",
  "fontM",
];

describe("theme tokens", () => {
  it("defines all 5 skins in both modes", () => {
    for (const skin of SKINS) {
      expect(themesDark[skin]).toBeDefined();
      expect(themesLight[skin]).toBeDefined();
    }
  });

  it("every skin has all required tokens", () => {
    for (const skin of SKINS) {
      for (const key of REQUIRED) {
        expect(themesDark[skin][key], `dark ${skin}.${key}`).toBeTruthy();
        expect(themesLight[skin][key], `light ${skin}.${key}`).toBeTruthy();
      }
    }
  });

  it("maps camelCase tokens to kebab-case CSS vars", () => {
    const vars = tokensToCssVars(themesDark.holo);
    expect(vars["--accent"]).toBe(themesDark.holo.accent);
    expect(vars["--border-strong"]).toBe(themesDark.holo.borderStrong);
    expect(vars["--panel-head"]).toBe(themesDark.holo.panelHead);
  });
});
