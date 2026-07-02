import { expect, test } from "vitest";

import { THEME_MODES, THEME_SKINS } from "@rtc/domain";

import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const COLOUR_KEYS: readonly (keyof RnTheme)[] = [
  "bgPrimary", "bgSecondary", "bgHeader", "bgFooter", "bgTile", "bgOverlay",
  "bgBrandPrimary", "textPrimary", "textSecondary", "textMuted", "textOnAccent",
  "accentPositive", "accentNegative", "accentAware", "accentPrimary", "accent2",
  "borderPrimary", "borderSubtle", "border", "borderStrong",
  "statusConnected", "statusConnecting", "statusDisconnected", "statusError",
  "panel", "panelHead", "chip",
];

const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s]+\))$/;

test("every skin × mode cell defines all colour keys as valid colour strings", () => {
  for (const skin of THEME_SKINS) {
    for (const mode of THEME_MODES) {
      const cell = rnThemeTokens[skin][mode];
      for (const key of COLOUR_KEYS) {
        const value = cell[key];
        expect(value, `${skin}.${mode}.${key}`).toMatch(COLOUR);
      }
    }
  }
});

test("no cell leaks a CSS var() reference", () => {
  for (const skin of THEME_SKINS) {
    for (const mode of THEME_MODES) {
      for (const value of Object.values(rnThemeTokens[skin][mode])) {
        if (typeof value === "string") {
          expect(value.includes("var(")).toBe(false);
        }
      }
    }
  }
});

test("classic uses system fonts; the other skins bind a display + mono family", () => {
  expect(rnThemeTokens.classic.dark.fontDisplay).toBeUndefined();
  expect(rnThemeTokens.classic.dark.fontMono).toBeUndefined();
  expect(rnThemeTokens.holo.dark.fontDisplay).toBe("ChakraPetch_500Medium");
  expect(rnThemeTokens.terminal.dark.fontMono).toBe("IBMPlexMono_400Regular");
});
