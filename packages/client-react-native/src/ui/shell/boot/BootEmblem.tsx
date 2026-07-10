import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

const SIZE = 96;

/** Boot splash emblem: a themed hex badge with a gently pulsing core. Pure
 * cosmetic — the react-native-svg stand-in for the web boot <canvas>, which is
 * Expo-Go-incompatible. The pulse is disabled under reduce-motion. */
export function BootEmblem(): JSX.Element {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled || reduce) {
          return;
        }

        loop = Animated.loop(
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
      })
      .catch(() => {
        // Cosmetic pulse only — if the reduce-motion probe rejects, just skip
        // the animation (same as reduce=true); never let it go unhandled.
      });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

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

interface BootEmblemStyles {
  wrap: ViewStyle;
}

const styles: BootEmblemStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
