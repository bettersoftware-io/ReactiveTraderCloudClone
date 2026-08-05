import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useBootMotionEnabled } from "#/ui/shell/boot/useBootMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Boot splash emblem: a themed hex badge with a gently pulsing core. Pure
 * cosmetic — the react-native-svg stand-in for the web boot <canvas>, which is
 * Expo-Go-incompatible.
 *
 * T16: the pulse used to gate on `AccessibilityInfo.isReduceMotionEnabled()`
 * alone — an OS-level signal this app has no authority over. That made the
 * emblem the ONE surface power-saver Freeze could not stop, against a repo
 * doctrine that Freeze kills all motion, and it left the `boot/static` golden
 * sampling a live animation (the capture only looked stable because the
 * driver's fixed post-mount settle re-samples the same phase). Routing through
 * `useBootMotionEnabled` fixes both at once: it already encodes
 * "Freeze always wins" over reduced-motion and the force-boot override, so the
 * fixture can pin the emblem by seeding `freeze` like any other scenario.
 */
export function BootEmblem(): JSX.Element {
  const theme = useTheme();
  const motionEnabled = useBootMotionEnabled();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!motionEnabled) {
      // Resting, fully opaque — the still frame, not a mid-pulse one.
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [motionEnabled, pulse]);

  return (
    <Animated.View
      testID="boot-emblem"
      style={[styles.wrap, { opacity: pulse }]}
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 48 48">
        <Polygon
          points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
          fill="none"
          stroke={theme.accentPrimary}
          strokeWidth={1.3}
        />
        <Polygon
          points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
          fill="none"
          stroke={theme.accent2}
          strokeWidth={1}
          opacity={0.6}
        />
        <Circle cx={24} cy={24} r={3.4} fill={theme.accentPrimary} />
      </Svg>
    </Animated.View>
  );
}

const SIZE = 96;

interface BootEmblemStyles {
  wrap: ViewStyle;
}

const styles: BootEmblemStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
