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

/** Decorative-only biometric readout on the lock overlay: a row of status dots
 * plus the channel line. No port behind it (matches the web's explicitly
 * decorative BiometricLine — there is no biometric signal). */
export function BiometricLine(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View testID="lock-biometric" style={styles.wrap}>
      <View style={styles.dots}>
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.off]} />
        <View style={[styles.dot, styles.off]} />
      </View>
      <Text style={styles.channel}>BIOMETRIC · ENCRYPTED CHANNEL</Text>
    </View>
  );
}

interface BiometricLineStyles {
  wrap: ViewStyle;
  dots: ViewStyle;
  dot: ViewStyle;
  on: ViewStyle;
  off: ViewStyle;
  channel: TextStyle;
}

function makeStyles(t: RnTheme): BiometricLineStyles {
  return StyleSheet.create({
    wrap: { alignItems: "center", gap: 8 },
    dots: { flexDirection: "row", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    on: { backgroundColor: t.accentPrimary },
    off: { backgroundColor: t.borderSubtle },
    channel: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 10,
      letterSpacing: 1,
    },
  });
}
