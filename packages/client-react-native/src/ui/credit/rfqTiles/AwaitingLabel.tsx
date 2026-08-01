// packages/client-react-native/src/ui/credit/rfqTiles/AwaitingLabel.tsx
import type { JSX } from "react";
import { useEffect } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** A dealer that is on the RFQ but has not priced it yet: `AWAITING…` with the
 * ellipsis breathing (prototype dc.html:249, `kfConnPulse 1.1s infinite`). The
 * word itself never fades — only the dots — so the row still reads at rest.
 * With motion gated off the ellipsis holds at full opacity. */
export function AwaitingLabel(): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const dim = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(dim);
      dim.value = 1;
      return;
    }

    dim.value = withRepeat(
      withSequence(
        withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS / 2 }),
        withTiming(1, { duration: PULSE_MS / 2 }),
      ),
      -1,
    );

    return () => {
      cancelAnimation(dim);
    };
  }, [enabled, dim]);

  const dotsStyle = useAnimatedStyle(() => {
    return { opacity: dim.value };
  });

  return (
    <View style={styles.row}>
      <Text
        style={[styles.label, { color: t.textMuted, fontFamily: t.fontMono }]}
      >
        AWAITING
      </Text>
      <Animated.Text
        testID="awaiting-ellipsis"
        style={[
          styles.label,
          { color: t.textMuted, fontFamily: t.fontMono },
          dotsStyle,
        ]}
      >
        …
      </Animated.Text>
    </View>
  );
}

/** `kfConnPulse`: `0%,100% { opacity: 1 }`, `50% { opacity: 0.35 }` over 1.1s
 * (dc.html:47). */
const PULSE_MS = 1100;
const PULSE_MIN_OPACITY = 0.35;

interface AwaitingLabelStyles {
  row: ViewStyle;
  label: TextStyle;
}

/** Plain `StyleSheet.create` — the only theme-derived values here are the two
 * colour/font props applied inline, so a `makeStyles(t)` would take an unused
 * parameter. */
const styles: AwaitingLabelStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  label: { fontSize: 8, letterSpacing: 1 },
});
