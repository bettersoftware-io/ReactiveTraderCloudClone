import type { TextStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";

/** The style fragment for emphasised text on a skin face — the REAL 600 /
 * 700 cut of a bundled family, or a plain `fontWeight` on the platform
 * default (`classic`), whose weights are real already. Never pair
 * `fontWeight` with a bundled `fontFamily` directly: a family registered
 * from one file has no sibling weights, so iOS synthesises a faux bold that
 * reads heavier than the design's true SemiBold / Bold.
 *
 * Spread it where `fontFamily` + `fontWeight` used to sit:
 * `{ fontSize: 9, ...weightedFont(t, "mono", "600") }`. */
export function weightedFont(
  t: RnTheme,
  face: FontFace,
  weight: FontWeightKey,
): TextStyle {
  const families = face === "mono" ? t.fontMonoWeights : t.fontDisplayWeights;

  if (families === undefined) {
    return { fontWeight: weight };
  }

  return { fontFamily: families[weight] };
}

export type FontFace = "display" | "mono";

export type FontWeightKey = "600" | "700";
