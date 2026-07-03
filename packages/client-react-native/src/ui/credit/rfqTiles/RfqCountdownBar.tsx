import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** A plain progress bar + seconds caption driven by the numeric
 * `useRfqCountdown` hook (re-renders every 100ms). No `Animated` — the value
 * itself changes, so the bar width follows via a normal re-render. Ported from
 * the web `RfqCountdown`. */
export function RfqCountdownBar({
  remainingMs,
  totalMs,
}: RfqCountdownBarProps): JSX.Element {
  const fraction =
    totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const warn = fraction <= 0.3;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrapper}>
      <View style={styles.track}>
        <View
          testID="rfq-countdown-fill"
          style={[
            warn ? styles.fillWarn : styles.fill,
            { width: `${fraction * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.caption}>{seconds}s remaining</Text>
    </View>
  );
}

interface RfqCountdownBarProps {
  remainingMs: number;
  totalMs: number;
}

interface RfqCountdownBarStyles {
  wrapper: ViewStyle;
  track: ViewStyle;
  fill: ViewStyle;
  fillWarn: ViewStyle;
  caption: TextStyle;
}

function makeStyles(t: RnTheme): RfqCountdownBarStyles {
  return StyleSheet.create({
    wrapper: { gap: 4, paddingVertical: 4 },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: t.bgSecondary,
      overflow: "hidden",
    },
    fill: { height: 4, borderRadius: 2, backgroundColor: t.accentPrimary },
    fillWarn: { height: 4, borderRadius: 2, backgroundColor: t.accentNegative },
    caption: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
  });
}
