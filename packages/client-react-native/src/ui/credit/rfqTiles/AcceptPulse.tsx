// packages/client-react-native/src/ui/credit/rfqTiles/AcceptPulse.tsx
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** The halo that marks the best priced quote's ACCEPT button, drawn behind it
 * as a `pointerEvents="none"` overlay.
 *
 * **A translation, not a port.** The prototype's `kfPulse` grows a `box-shadow`
 * out to a 9 px ring and fades it (dc.html:38). RN cannot animate `box-shadow`,
 * and `docs/performance.md` forbids animating anything but transform/opacity
 * anyway — so the same read is produced by a sibling rectangle scaling out and
 * fading. Renders `null` entirely when motion is gated off: a static halo would
 * be a permanent coloured smear behind the button rather than a hint.
 *
 * Tinted with `accentPrimary`, not `accentPositive`: the design's `pulseC` is
 * `color-mix(in oklab, acc 55%, transparent)` (dc.html:2153), the same accent
 * the button it haloes is filled with. */
export function AcceptPulse(): JSX.Element | null {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const scale = useSharedValue(1);
  const fade = useSharedValue(PULSE_PEAK_OPACITY);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(scale);
      cancelAnimation(fade);
      return;
    }

    scale.value = withRepeat(
      withTiming(PULSE_MAX_SCALE, {
        duration: PULSE_MS,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false,
    );
    fade.value = withRepeat(
      withTiming(0, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(fade);
    };
  }, [enabled, scale, fade]);

  const haloStyle = useAnimatedStyle(() => {
    return { opacity: fade.value, transform: [{ scale: scale.value }] };
  });

  if (!enabled) {
    return null;
  }

  return (
    <Animated.View
      testID="accept-pulse"
      pointerEvents="none"
      style={[styles.halo, { backgroundColor: t.accentPrimary }, haloStyle]}
    />
  );
}

/** `kfPulse` reaches its 9 px ring at 55% of a ~1.4 s cycle (dc.html:38); at an
 * 11 px-padded button that ring is roughly a 45% outward growth. */
const PULSE_MS = 1400;
const PULSE_MAX_SCALE = 1.45;
const PULSE_PEAK_OPACITY = 0.55;

interface AcceptPulseStyles {
  halo: ViewStyle;
}

/** Plain `StyleSheet.create` — the tint is applied inline from `useTheme`, so a
 * `makeStyles(t)` would take an unused parameter. */
const styles: AcceptPulseStyles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFill,
    borderRadius: 7,
  },
});
