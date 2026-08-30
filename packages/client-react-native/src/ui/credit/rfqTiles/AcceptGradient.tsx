import type { JSX } from "react";
import { useId } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

/** The best quote's ACCEPT fill: the design's vertical accent → accent2 ramp
 * (dc.html:2153 — `btnBg: isBest ? linear-gradient(180deg, acc, acc2) : chip`),
 * drawn as a `pointerEvents="none"` sublayer with the already-bundled
 * react-native-svg, exactly the way `SurfaceCard` draws its tile sheen — RN has
 * no CSS gradient background.
 *
 * Every other ACCEPT on the card is a flat `chip` tint, so this ramp is the one
 * row the eye is meant to land on; it is the button's *fill*, not decoration,
 * and therefore renders regardless of the motion gate (unlike `AcceptPulse`,
 * which is a hint and disappears when motion is off). */
export function AcceptGradient(): JSX.Element {
  const t = useTheme();
  // Per-instance gradient id (useId — static literals trip Biome's
  // useUniqueElementIds). Colons stripped so `url(#…)` parses cleanly.
  const gradientId = `${useId().replace(/:/g, "")}-accept`;

  return (
    <Svg style={styles.fill} testID="accept-gradient" pointerEvents="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.accentPrimary} stopOpacity={1} />
          <Stop offset="1" stopColor={t.accent2} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#${gradientId})`}
      />
    </Svg>
  );
}

interface AcceptGradientStyles {
  fill: ViewStyle;
}

/** Plain `StyleSheet.create` — both stops come from `useTheme`, so a
 * `makeStyles(t)` would take an unused parameter. */
const styles: AcceptGradientStyles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
