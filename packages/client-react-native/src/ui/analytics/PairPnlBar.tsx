import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/**
 * One pair's P&L bar, growing out from the centre line.
 *
 * WHY A SEPARATE COMPONENT. The bar owns a shared value and an effect, and
 * hooks cannot live inside the `.map()` in `PairPnlBars`. One component per row
 * is the only shape that gives each bar its own animation.
 *
 * WHY `scaleX` AND NOT `flex`. The previous version set `flex: fraction`, which
 * animates LAYOUT — banned by `docs/performance.md` and impossible to run off
 * the JS thread. A fixed-width track with a transform-scaled bar is the same
 * picture, on the UI thread.
 *
 * THE ORIGIN IS LOAD-BEARING. A default centre-origin `scaleX` on a half-width
 * bar grows in BOTH directions from its own midpoint, which reads as a bar
 * floating away from the centre line rather than emerging from it. Positive
 * bars anchor their left edge to the centre and grow right; negative bars
 * anchor their right edge and grow left.
 */
export function PairPnlBar({
  fraction,
  positive,
}: PairPnlBarProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useShellMotionEnabled();
  // Starts at the resting value when motion is off, so the static end-state
  // renders immediately rather than a mid-tween frame.
  const scale = useSharedValue(motionEnabled ? 0 : fraction);

  useEffect(() => {
    scale.value = motionEnabled
      ? withTiming(fraction, { duration: BAR_DURATION_MS, easing: BAR_EASING })
      : fraction;
  }, [fraction, motionEnabled, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return { transform: [{ scaleX: scale.value }] };
  });

  return (
    <View style={styles.track}>
      <View style={styles.centerLine} />
      <Animated.View
        testID={positive ? "pair-pnl-bar-pos" : "pair-pnl-bar-neg"}
        style={[
          styles.bar,
          positive ? styles.barPos : styles.barNeg,
          animatedStyle,
        ]}
      />
    </View>
  );
}

/** The prototype's bar tween: 800ms on `cubic-bezier(0.3, 0.9, 0.3, 1)`. */
const BAR_DURATION_MS = 800;
const BAR_EASING = Easing.bezier(0.3, 0.9, 0.3, 1);

interface PairPnlBarProps {
  /** How far the bar extends from the centre, 0→1 of its half-track. */
  fraction: number;
  positive: boolean;
}

interface PairPnlBarStyles {
  track: ViewStyle;
  centerLine: ViewStyle;
  bar: ViewStyle;
  barPos: ViewStyle;
  barNeg: ViewStyle;
}

function makeStyles(t: RnTheme): PairPnlBarStyles {
  return StyleSheet.create({
    // T40/T41: the prototype's track is a RECESSED RAIL, not an invisible
    // layout box — `background: var(--panel-head); border-radius: 3px`
    // (dc.html:183). Without it the bars float on the card and the row loses
    // the "how far along is this" reading the rail gives for free. The bar
    // itself is inset 1px top and bottom inside a 12px track (so 10px, not
    // 8), rounded 2px, and drawn at 0.85 opacity — which is why ours read
    // harder and heavier than the design's.
    track: {
      flex: 1,
      height: 12,
      justifyContent: "center",
      backgroundColor: t.panelHead,
      borderRadius: 3,
      overflow: "hidden",
    },
    centerLine: {
      position: "absolute",
      left: "50%",
      width: 1,
      height: 12,
      backgroundColor: t.border,
    },
    bar: {
      position: "absolute",
      width: "50%",
      height: 10,
      borderRadius: 2,
      opacity: 0.85,
    },
    barPos: {
      left: "50%",
      transformOrigin: "left",
      backgroundColor: t.accentPositive,
    },
    barNeg: {
      right: "50%",
      transformOrigin: "right",
      backgroundColor: t.accentNegative,
    },
  });
}
