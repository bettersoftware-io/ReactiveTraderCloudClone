import { type JSX, type ReactNode, useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** Wraps the hex emblem with two counter-rotating arcs and a pulse, so the
 * emblem itself reads as spinning up while a `reactor` wait is in flight —
 * the RN port of the web clients' `ReactorRings`.
 *
 * A pure wrapper: the emblem arrives as `children` and is never reached into,
 * because the same `LockEmblem` renders bare whenever no request is in flight.
 *
 * The rotation is an RN transform on each ring's wrapping view, never on the
 * SVG `<Circle>`: an animated transform on an SVG child is redrawn by
 * react-native-svg every frame, where a view transform is composited. With
 * motion gated off the rings rest unrotated and the emblem unscaled. */
export function ReactorRings({ children }: ReactorRingsProps): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const outer = useSharedValue(0);
  const inner = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(outer);
      cancelAnimation(inner);
      cancelAnimation(pulse);
      outer.value = 0;
      inner.value = 0;
      pulse.value = 0;
      return;
    }

    outer.value = withRepeat(
      withTiming(360, { duration: OUTER_SPIN_MS, easing: Easing.linear }),
      -1,
    );
    inner.value = withRepeat(
      withTiming(-360, { duration: INNER_SPIN_MS, easing: Easing.linear }),
      -1,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PULSE_MS / 2, easing: PULSE_EASING }),
        withTiming(0, { duration: PULSE_MS / 2, easing: PULSE_EASING }),
      ),
      -1,
    );

    return () => {
      cancelAnimation(outer);
      cancelAnimation(inner);
      cancelAnimation(pulse);
    };
  }, [enabled, outer, inner, pulse]);

  const outerStyle = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${outer.value}deg` }] };
  });

  const innerStyle = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${inner.value}deg` }] };
  });

  const emblemStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - pulse.value * (1 - PULSE_MIN_OPACITY),
      transform: [{ scale: 1 + pulse.value * (PULSE_MAX_SCALE - 1) }],
    };
  });

  return (
    <View testID="auth-wait-rings" style={styles.root}>
      <Animated.View
        testID="auth-wait-ring-outer"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.ringOuter, outerStyle]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Circle
            cx={50}
            cy={50}
            r={46}
            fill="none"
            stroke={t.accentPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray="34 130"
          />
        </Svg>
      </Animated.View>
      <Animated.View
        testID="auth-wait-ring-inner"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.ringInner, innerStyle]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Circle
            cx={50}
            cy={50}
            r={46}
            fill="none"
            stroke={t.borderStrong}
            strokeWidth={1.5}
            strokeDasharray="10 22"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={emblemStyle}>{children}</Animated.View>
    </View>
  );
}

interface ReactorRingsProps {
  readonly children: ReactNode;
}

/** ReactorRings.module.css — `spin 1.4s`, `spin-reverse 2.3s`, both linear. */
const OUTER_SPIN_MS = 1400;
const INNER_SPIN_MS = 2300;
/** `pulse 1.8s ease-in-out`: `50% { opacity: 0.72; transform: scale(1.06) }`. */
const PULSE_MS = 1800;
const PULSE_EASING = Easing.inOut(Easing.quad);
const PULSE_MIN_OPACITY = 0.72;
const PULSE_MAX_SCALE = 1.06;
/** How far each ring stands off the emblem's own box (`inset: -14px / -6px`). */
const OUTER_INSET = -14;
const INNER_INSET = -6;

interface ReactorRingsStyles {
  root: ViewStyle;
  ringOuter: ViewStyle;
  ringInner: ViewStyle;
}

/** Plain `StyleSheet.create`: the only theme-derived values are the two
 * stroke colours, applied on the circles. */
const styles: ReactorRingsStyles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
  ringOuter: {
    position: "absolute",
    top: OUTER_INSET,
    right: OUTER_INSET,
    bottom: OUTER_INSET,
    left: OUTER_INSET,
  },
  ringInner: {
    position: "absolute",
    top: INNER_INSET,
    right: INNER_INSET,
    bottom: INNER_INSET,
    left: INNER_INSET,
  },
});
