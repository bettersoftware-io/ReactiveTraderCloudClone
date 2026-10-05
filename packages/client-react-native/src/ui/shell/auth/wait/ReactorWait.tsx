import { type JSX, useEffect } from "react";
import { StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The `reactor` login-wait treatment's lower half: an indeterminate bar and
 * a pulsing status line — the RN port of the web clients' `ReactorWait`. The
 * counter-rotating arcs around the emblem are `ReactorRings`.
 *
 * Only `transform` and `opacity` move. With motion gated off the bar rests at
 * the left of its track and the status line holds at full strength, so the
 * frozen frame still says what is happening. */
export function ReactorWait(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const enabled = useShellMotionEnabled();
  const slide = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(slide);
      cancelAnimation(pulse);
      slide.value = 0;
      pulse.value = 1;
      return;
    }

    slide.value = BAR_FROM;
    slide.value = withRepeat(
      withTiming(BAR_TO, { duration: SLIDE_MS, easing: SLIDE_EASING }),
      -1,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS / 2 }),
        withTiming(1, { duration: PULSE_MS / 2 }),
      ),
      -1,
    );

    return () => {
      cancelAnimation(slide);
      cancelAnimation(pulse);
    };
  }, [enabled, slide, pulse]);

  const barStyle = useAnimatedStyle(() => {
    return { transform: [{ translateX: slide.value }] };
  });

  const statusStyle = useAnimatedStyle(() => {
    return { opacity: pulse.value };
  });

  return (
    <View testID="auth-wait-reactor" style={styles.wait}>
      <View
        testID="auth-wait-reactor-track"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.track}
      >
        <Animated.View
          testID="auth-wait-reactor-bar"
          style={[styles.bar, barStyle]}
        />
      </View>
      <Animated.Text
        accessibilityLiveRegion="polite"
        style={[styles.status, statusStyle]}
      >
        ▸ AWAITING AUTH GRANT
      </Animated.Text>
    </View>
  );
}

/** The same 220 column as the credential inputs above it. */
const TRACK_WIDTH = 220;
/** ReactorWait.module.css — the bar is 35% of its track and slides from
 * `translateX(-105%)` to `translateX(390%)` of ITS OWN width. */
const BAR_WIDTH: number = TRACK_WIDTH * 0.35;
const BAR_FROM: number = BAR_WIDTH * -1.05;
const BAR_TO: number = BAR_WIDTH * 3.9;
/** `slide 1.25s cubic-bezier(0.65, 0, 0.35, 1) infinite`. */
const SLIDE_MS = 1250;
const SLIDE_EASING = Easing.bezier(0.65, 0, 0.35, 1);
/** `pulse 1.8s ease-in-out infinite`, `50% { opacity: 0.55 }`. */
const PULSE_MS = 1800;
const PULSE_MIN_OPACITY = 0.55;

interface ReactorWaitStyles {
  wait: ViewStyle;
  track: ViewStyle;
  bar: ViewStyle;
  status: TextStyle;
}

function makeStyles(t: RnTheme): ReactorWaitStyles {
  return StyleSheet.create({
    wait: { width: TRACK_WIDTH, marginTop: 10 },
    track: {
      height: 2,
      marginTop: 9,
      overflow: "hidden",
      borderRadius: 2,
      backgroundColor: t.borderSubtle,
    },
    bar: {
      width: BAR_WIDTH,
      height: 2,
      borderRadius: 2,
      backgroundColor: t.accentPrimary,
    },
    status: {
      marginTop: 10,
      textAlign: "center",
      color: t.accentPrimary,
      ...labelStyle(t, 10, 1.6),
    },
  });
}
