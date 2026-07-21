// packages/client-react-native/src/ui/shell/lock/HoldToUnlockRing.tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  GestureDetector,
  type LongPressGesture,
} from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedProps,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ringCircumference, ringDashOffset } from "@rtc/motion-core";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The lock screen's submit affordance: a ring that fills as the operator
 * holds it, replacing the old tap-only AUTHENTICATE button (`gesture` and
 * `progress` come from `useHoldToUnlock`, driving `ringDashOffset` from
 * `@rtc/motion-core` rather than recomputing the dash math here). A held
 * ring reads as a deliberate, hard-to-fat-finger submit for an
 * authentication action; `onPress` keeps a plain tap as an instant-submit
 * fallback — a sustained hold is not universally operable (accessibility)
 * and can't be driven by e2e/unit automation. Both paths converge on the
 * same submit one layer up (`LockScreen`) — this component only renders the
 * affordance and forwards intent. Carries the `lock-authenticate` testID so
 * existing press-based tests/e2e keep working unmodified. */
export function HoldToUnlockRing({
  gesture,
  progress,
  onPress,
}: HoldToUnlockRingProps): JSX.Element {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);

  const circumference = ringCircumference(RADIUS);
  const animatedCircleProps = useAnimatedProps(() => {
    return { strokeDashoffset: ringDashOffset(RADIUS, progress.value) };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        testID="lock-authenticate"
        accessibilityRole="button"
        accessibilityLabel="Authenticate"
        accessibilityHint="Hold to submit your password, or tap to submit immediately"
        onPress={onPress}
        style={styles.wrap}
      >
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={t.borderSubtle}
            strokeWidth={STROKE_WIDTH}
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={t.accentPrimary}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={circumference}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            animatedProps={animatedCircleProps}
          />
        </Svg>
        <Text style={styles.label}>AUTHENTICATE ▸</Text>
      </Pressable>
    </GestureDetector>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface HoldToUnlockRingProps {
  readonly gesture: LongPressGesture;
  readonly progress: SharedValue<number>;
  readonly onPress: () => void;
}

const SIZE = 64;
const RADIUS = 26;
const STROKE_WIDTH = 3;

interface HoldToUnlockRingStyles {
  wrap: ViewStyle;
  label: TextStyle;
}

function makeStyles(t: RnTheme): HoldToUnlockRingStyles {
  return StyleSheet.create({
    wrap: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
    },
    label: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 14,
      letterSpacing: 1,
    },
  });
}
