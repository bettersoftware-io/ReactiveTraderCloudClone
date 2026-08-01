// packages/client-react-native/src/ui/credit/rfqTiles/RfqCountdownRing.tsx
import type { JSX } from "react";
import { StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ringCircumference } from "@rtc/motion-core";

import { RFQ_RING_RADIUS, rfqRingVm } from "#/ui/credit/rfqTiles/rfqRingVm";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** The RFQ tile's countdown: a 32×32 ring that drains anticlockwise-from-noon
 * with the remaining seconds in its centre (prototype dc.html:229-233),
 * replacing the flat progress bar this ports from.
 *
 * **Why the `withTiming` bridge exists.** `useRfqCountdown` delivers a plain JS
 * number every 100 ms; binding it straight to `strokeDashoffset` would render
 * ten visible steps a second. The prototype gets its smooth sweep from CSS
 * `transition: stroke-dashoffset 1s linear` (dc.html:232) — the RN equivalent
 * is a 1 s linear `withTiming` toward each new target, which keeps the ring
 * gliding on the UI thread between JS updates. The colour flip mirrors the same
 * declaration's `stroke 0.4s`. With motion gated off both snap to the
 * end-state, so a Freeze user sees a correct static ring. */
export function RfqCountdownRing({
  remainingMs,
  totalMs,
}: RfqCountdownRingProps): JSX.Element {
  const t = useTheme();
  const motion = useShellMotionEnabled();
  const vm = rfqRingVm(remainingMs, totalMs);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  const offset = useDerivedValue(() => {
    return motion
      ? withTiming(vm.dashOffset, {
          duration: RING_GLIDE_MS,
          easing: Easing.linear,
        })
      : vm.dashOffset;
  });

  const urgency = useDerivedValue(() => {
    const target = vm.isUrgent ? 1 : 0;
    return motion ? withTiming(target, { duration: RING_TINT_MS }) : target;
  });

  const strokeProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: offset.value,
      stroke: interpolateColor(
        urgency.value,
        [0, 1],
        [t.accentPrimary, t.accentNegative],
      ),
    };
  });

  // The prototype tints the seconds readout with the same `q.ringC` as the
  // stroke, so it flips in step. `color` is a TextStyle, which `Animated.Text`
  // accepts — an AnimatedStyle<ViewStyle> would not be.
  const secondsStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        urgency.value,
        [0, 1],
        [t.accentPrimary, t.accentNegative],
      ),
    };
  });

  return (
    <View testID="rfq-countdown-ring" style={styles.root}>
      <Svg
        width={RING_BOX}
        height={RING_BOX}
        viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      >
        <Circle
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RFQ_RING_RADIUS}
          fill="none"
          stroke={t.borderSubtle}
          strokeWidth={RING_STROKE}
        />
        <AnimatedCircle
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RFQ_RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={ringCircumference(RFQ_RING_RADIUS)}
          transform={`rotate(-90 ${RING_CENTRE} ${RING_CENTRE})`}
          animatedProps={strokeProps}
        />
      </Svg>
      <View style={styles.readout} pointerEvents="none">
        <Animated.Text
          style={[styles.seconds, { fontFamily: t.fontMono }, secondsStyle]}
        >
          {seconds}
        </Animated.Text>
      </View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RfqCountdownRingProps {
  readonly remainingMs: number;
  readonly totalMs: number;
}

/** Prototype dc.html:229-233 — a 32×32 box, `r=13`, `stroke-width 2.5`, the
 * whole svg rotated -90° so the sweep starts at noon. */
const RING_BOX = 32;
const RING_CENTRE = 16;
const RING_STROKE = 2.5;
/** `transition: stroke-dashoffset 1s linear, stroke 0.4s` (dc.html:232). */
const RING_GLIDE_MS = 1000;
const RING_TINT_MS = 400;

interface RfqCountdownRingStyles {
  root: ViewStyle;
  readout: ViewStyle;
  seconds: TextStyle;
}

/** Plain `StyleSheet.create`, NOT `useThemedStyles`: every styled value here is
 * a fixed geometry from the prototype, so a `makeStyles(t)` would take an
 * unused parameter (a lint error). The theme-derived colours live on the nodes
 * above, where they belong — they are SVG props and an animated tint. */
const styles: RfqCountdownRingStyles = StyleSheet.create({
  root: {
    width: RING_BOX,
    height: RING_BOX,
    flexGrow: 0,
    flexShrink: 0,
  },
  readout: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  seconds: { fontSize: 8.5 },
});
