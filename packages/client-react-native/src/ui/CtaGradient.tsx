import type { JSX } from "react";
import { useId } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

/** A CTA's vertical fill ramp — the design paints every primary action with a
 * two-stop `linear-gradient(180deg, …)`: accent → accent2 on ACCEPT /
 * BROADCAST RFQ / SUBMIT BID (dc.html:2153, :284, :305), and side-colour →
 * its 72%-toward-black mix on the equities BUY/SELL CTA (dc.html:2371). The
 * stops default to the theme accents; a caller with its own ramp passes
 * `from`/`to`. Drawn as a `pointerEvents="none"` sublayer with the
 * already-bundled react-native-svg, exactly the way `TileSheen` draws the
 * tile surface — RN has no CSS gradient background. The host button clips it
 * (`overflow: "hidden"`) and keeps a flat fallback fill beneath it.
 *
 * Named `AcceptGradient` until 2026-09-02, when the equities CTA joined and
 * the name stopped covering its users. Renders regardless of the motion gate
 * (unlike `AcceptPulse`): a gradient is paint, not motion. */
export function CtaGradient({ from, to }: CtaGradientProps): JSX.Element {
  const t = useTheme();
  const gradientId = `${useId().replace(/:/g, "")}-cta`;

  return (
    <Svg style={styles.fill} testID="cta-gradient" pointerEvents="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop
            offset="0"
            stopColor={from ?? t.accentPrimary}
            stopOpacity={1}
          />
          <Stop offset="1" stopColor={to ?? t.accent2} stopOpacity={1} />
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

export interface CtaGradientProps {
  /** Top stop; defaults to the theme's `accentPrimary`. */
  readonly from?: string;
  /** Bottom stop; defaults to the theme's `accent2`. */
  readonly to?: string;
}

interface CtaGradientStyles {
  fill: ViewStyle;
}

/** Plain `StyleSheet.create` — the stops come from `useTheme` (or props), so a
 * `makeStyles(t)` would take an unused parameter. */
const styles: CtaGradientStyles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
