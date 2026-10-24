// packages/client-react-native/src/ui/shell/lock/LockEmblem.tsx
import { type JSX, useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  FeDropShadow,
  Filter,
  G,
  Polygon,
} from "react-native-svg";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** The lock overlay's hex emblem — the mobile-v1 prototype's lock-screen
 * mark (`Reactive Trader Mobile.dc.html` "lock screen" block): the outer
 * accent hex, the inner `accent2` hex at 60%, a dashed `accent2` orbit that
 * turns once every `ORBIT_SPIN_MS`, the accent core, all under an accent
 * drop-shadow glow. The orbit is the only motion and is gated exactly like
 * `HexReticleLogo`'s loops: `useShellMotionEnabled()` off (reduced motion /
 * power-saver Freeze) cancels the `withRepeat(-1)` worklet and rests the
 * orbit at 0°, so a golden captures one fixed frame.
 *
 * Two stacked `<Svg>` layers, not one. react-native-svg redraws a whole
 * `<Svg>` whenever any child changes, so with the orbit spinning in the same
 * `<Svg>` the filtered hexes redrew every frame — Core Image ran the drop
 * shadow 60 times a second on the main thread, and its backdrop capture,
 * which fails inside `drawRect:`, logged a `CGBitmapContextCreate … invalid
 * context 0x0` burst each time (~250 log lines a second). The glow layer's
 * props never change, so it draws once; only the orbit layer redraws. Same
 * paint order and viewBox, so the composite is unchanged. */
export function LockEmblem(): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const orbitAngle = useSharedValue(0);
  const glowId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(orbitAngle);
      orbitAngle.value = 0;
      return;
    }

    orbitAngle.value = withRepeat(
      withTiming(360, { duration: ORBIT_SPIN_MS, easing: Easing.linear }),
      -1,
    );

    return () => {
      cancelAnimation(orbitAngle);
    };
  }, [enabled, orbitAngle]);

  const orbitStyle = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${orbitAngle.value}deg` }] };
  });

  return (
    <View testID="lock-emblem" style={styles.emblem}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <Filter id={glowId}>
          <FeDropShadow
            dx={0}
            dy={0}
            stdDeviation={GLOW_STD_DEVIATION}
            floodColor={t.accentPrimary}
          />
        </Filter>
        <G filter={`url(#${glowId})`}>
          <G
            fill="none"
            stroke={t.accentPrimary}
            strokeWidth={1.3}
            strokeLinejoin="round"
          >
            <Polygon points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5" />
            <Polygon
              points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
              stroke={t.accent2}
              opacity={0.6}
            />
          </G>
          <Circle cx={CENTER} cy={CENTER} r={3.4} fill={t.accentPrimary} />
        </G>
      </Svg>
      {/* Outside the filtered layer (loses the glow, which a 1px dashed
          hairline barely carried), and turned by rotating the whole layer as
          a native view: the compositor applies the transform, so no SVG is
          redrawn per frame. The viewBox scales uniformly, so the view's centre
          IS the orbit's centre (24, 24). Two earlier routes failed on iOS
          (react-native-svg 15.15): an animated SVG `rotation`/`origin` prop
          never moved the ring at all, because native SVG has no such prop
          (`rotation` becomes a matrix only in JS), so every update only
          marked the <Svg> dirty; and a transform on an animated <G> drew the
          orbit displaced off the emblem. */}
      <Animated.View style={[StyleSheet.absoluteFill, orbitStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={11}
            fill="none"
            stroke={t.accent2}
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Both layers share it, so the orbit sits exactly where it did inside the
 * one `<Svg>` it used to share with the hexes. */
const VIEW_BOX = "0 0 48 48";

/** The prototype's 58px lock mark (the header reticle is 30px). */
const SIZE = 58;
const CENTER = 24;
/** One full turn of the dashed orbit — the prototype's `kfSpin 16s`. */
const ORBIT_SPIN_MS = 16_000;
/** The prototype's `drop-shadow(0 0 9px acc)`: a 9px blur radius is a
 * Gaussian of roughly half that σ. */
const GLOW_STD_DEVIATION = 4.5;

const styles = StyleSheet.create({
  emblem: { width: SIZE, height: SIZE },
});
