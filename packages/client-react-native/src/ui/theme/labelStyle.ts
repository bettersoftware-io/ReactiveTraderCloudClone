import type { TextStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import type { FontWeightKey } from "#/ui/theme/weightedFont";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The design's small mono label recipe — the tracked, mono-faced type that
 * heads a section, names a chip, or fills a status cell — as one style
 * fragment: the skin's mono face at `size` with `tracking` letter-spacing,
 * optionally in the face's real 600 / 700 cut.
 *
 * Colour is deliberately NOT part of it: every label carries its own, so the
 * call site keeps `color` beside the spread:
 * `{ ...labelStyle(t, 8.5, 2), color: t.textMuted }`.
 *
 * `weight` delegates to `weightedFont`, which either resolves the bundled
 * family's real cut (overriding `fontFamily` here) or, on the platform-default
 * `classic` skin, sets a plain `fontWeight` — never a faux-bold pairing of
 * `fontWeight` with a single-file bundled family. */
export function labelStyle(
  t: RnTheme,
  size: number,
  tracking: number,
  weight?: FontWeightKey,
): TextStyle {
  const base: TextStyle = {
    fontFamily: t.fontMono,
    fontSize: size,
    letterSpacing: tracking,
  };

  if (weight === undefined) {
    return base;
  }

  return { ...base, ...weightedFont(t, "mono", weight) };
}
