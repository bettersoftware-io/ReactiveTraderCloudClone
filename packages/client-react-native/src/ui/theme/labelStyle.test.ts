import { describe, expect, it } from "vitest";

import {
  FONT_JETBRAINS_MONO,
  FONT_JETBRAINS_MONO_600,
} from "#/ui/theme/fontFamilies";
import { labelStyle } from "#/ui/theme/labelStyle";
import { rnThemeTokens } from "#/ui/theme/tokens";

describe("labelStyle", () => {
  it("is the skin's mono face at the given size and tracking", () => {
    expect(labelStyle(rnThemeTokens.holo.dark, 8.5, 2)).toEqual({
      fontFamily: FONT_JETBRAINS_MONO,
      fontSize: 8.5,
      letterSpacing: 2,
    });
  });

  it("resolves a weight to the face's real cut, overriding the plain family", () => {
    expect(labelStyle(rnThemeTokens.holo.dark, 9, 1, "600")).toEqual({
      fontFamily: FONT_JETBRAINS_MONO_600,
      fontSize: 9,
      letterSpacing: 1,
    });
  });

  it("falls back to a plain fontWeight on the skin with no cuts", () => {
    expect(labelStyle(rnThemeTokens.classic.dark, 10, 2.5, "700")).toEqual({
      fontFamily: undefined,
      fontSize: 10,
      letterSpacing: 2.5,
      fontWeight: "700",
    });
  });
});
