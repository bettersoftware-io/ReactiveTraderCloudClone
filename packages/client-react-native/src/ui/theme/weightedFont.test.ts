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

  it("falls back to a plain fontWeight on the platform default DISPLAY face", () => {
    expect(weightedFont(rnThemeTokens.classic.light, "display", "600")).toEqual(
      { fontWeight: "600" },
    );
  });

  it("keeps the platform mono family under a weighted classic mono label", () => {
    // On device `ThemeProvider` has already filled classic's `fontMono` with
    // the platform monospace (Menlo on iOS); dropping the family here sent
    // weighted mono labels to the SANS while unweighted ones sat in Menlo.
    const provided = { ...rnThemeTokens.classic.dark, fontMono: "Menlo" };
    expect(weightedFont(provided, "mono", "700")).toEqual({
      fontFamily: "Menlo",
      fontWeight: "700",
    });
    // A raw token cell (vitest, no provider) passes its `undefined` through —
    // RN reads that as the system default, same as before.
    expect(weightedFont(rnThemeTokens.classic.dark, "mono", "700")).toEqual({
      fontFamily: undefined,
      fontWeight: "700",
    });
  });
});
