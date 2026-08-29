import { describe, expect, it } from "vitest";

import {
  FONT_IBM_SANS_700,
  FONT_JETBRAINS_MONO_600,
} from "#/ui/theme/fontFamilies";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { weightedFont } from "#/ui/theme/weightedFont";

describe("weightedFont", () => {
  it("resolves a bundled face to its real cut, with no fontWeight", () => {
    expect(weightedFont(rnThemeTokens.holo.dark, "mono", "600")).toEqual({
      fontFamily: FONT_JETBRAINS_MONO_600,
    });
    expect(
      weightedFont(rnThemeTokens.terminal.light, "display", "700"),
    ).toEqual({ fontFamily: FONT_IBM_SANS_700 });
  });

  it("falls back to a plain fontWeight on the platform default face", () => {
    expect(weightedFont(rnThemeTokens.classic.dark, "mono", "700")).toEqual({
      fontWeight: "700",
    });
    expect(weightedFont(rnThemeTokens.classic.light, "display", "600")).toEqual(
      { fontWeight: "600" },
    );
  });
});
