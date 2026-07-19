// packages/client-react-native/src/ui/shell/hud/HexReticleLogo.tsx
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Polygon } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** Animated hex-reticle wordmark logo, ported from the mobile prototype
 * header (`Reactive Trader Mobile.dc.html:67-84`): static outer/inner hex +
 * reticle ticks, a dashed ring spinning 16s CW (`kfSpin`), and a twin-triangle
 * group counter-spinning 22s CCW (`kfSpinRev`). Both loops run only while
 * `useShellMotionEnabled()` — reduced-motion / power-saver Freeze leave a
 * static reticle and cancel the worklets (no orphaned `withRepeat(-1)` left
 * running on the UI thread, per the perf doctrine — mirrors
 * `AmbientBackground`). Only `transform` animates. */
export function HexReticleLogo({
  size = 30,
}: HexReticleLogoProps): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const ringAngle = useSharedValue(0);
  const triAngle = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      // Reduced-motion / Freeze: cancel and rest both loops at their static
      // angle rather than leaving a withRepeat(-1) worklet running forever.
      cancelAnimation(ringAngle);
      cancelAnimation(triAngle);
      ringAngle.value = 0;
      triAngle.value = 0;
      return;
    }

    ringAngle.value = withRepeat(
      withTiming(360, { duration: OUTER_SPIN_MS, easing: Easing.linear }),
      -1,
    );
    triAngle.value = withRepeat(
      withTiming(-360, { duration: INNER_SPIN_MS, easing: Easing.linear }),
      -1,
    );

    return () => {
      cancelAnimation(ringAngle);
      cancelAnimation(triAngle);
    };
  }, [enabled, ringAngle, triAngle]);

  const ringProps = useAnimatedProps(() => {
    return { transform: [{ rotate: `${ringAngle.value}deg` }] };
  });

  const triProps = useAnimatedProps(() => {
    return { transform: [{ rotate: `${triAngle.value}deg` }] };
  });

  return (
    <Svg
      testID="hud-logo"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={styles.logo}
    >
      <G
        fill="none"
        stroke={t.accentPrimary}
        strokeWidth={1.4}
        strokeLinejoin="round"
      >
        <Polygon
          points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
          opacity={0.9}
        />
        <Polygon
          points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
          stroke={t.accent2}
          strokeWidth={1}
          opacity={0.6}
        />
      </G>
      <G
        stroke={t.accentPrimary}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.85}
      >
        <Line x1="24" y1="2" x2="24" y2="6" />
        <Line x1="24" y1="42" x2="24" y2="46" />
        <Line x1="5" y1="13" x2="8.5" y2="15" />
        <Line x1="43" y1="13" x2="39.5" y2="15" />
        <Line x1="5" y1="35" x2="8.5" y2="33" />
        <Line x1="43" y1="35" x2="39.5" y2="33" />
      </G>
      <AnimatedG animatedProps={ringProps} originX={CENTER} originY={CENTER}>
        <Circle
          cx="24"
          cy="24"
          r="11"
          fill="none"
          stroke={t.accent2}
          strokeWidth={1}
          strokeDasharray="3 5"
          opacity={0.85}
        />
      </AnimatedG>
      <AnimatedG animatedProps={triProps} originX={CENTER} originY={CENTER}>
        <Path
          d="M24 15 L31.8 28.5 L16.2 28.5 Z"
          fill="none"
          stroke={t.accentPrimary}
          strokeWidth={1.2}
          strokeLinejoin="round"
          opacity={0.8}
        />
        <Path
          d="M24 33 L16.2 19.5 L31.8 19.5 Z"
          fill="none"
          stroke={t.accentPrimary}
          strokeWidth={1.2}
          strokeLinejoin="round"
          opacity={0.5}
        />
      </AnimatedG>
      <Circle cx="24" cy="24" r="3.4" fill={t.accentPrimary} />
      <Circle
        cx="24"
        cy="24"
        r="6.4"
        fill="none"
        stroke={t.accentPrimary}
        strokeWidth={1}
      />
    </Svg>
  );
}

const AnimatedG = Animated.createAnimatedComponent(G);

export interface HexReticleLogoProps {
  readonly size?: number;
}

const OUTER_SPIN_MS = 16_000;
const INNER_SPIN_MS = 22_000;
const CENTER = 24;

interface HexReticleLogoStyles {
  logo: ViewStyle;
}

const styles: HexReticleLogoStyles = StyleSheet.create({
  logo: { display: "flex" },
});
