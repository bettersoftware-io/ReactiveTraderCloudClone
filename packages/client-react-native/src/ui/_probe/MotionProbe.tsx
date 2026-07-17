import { Canvas, Circle, Fill } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Flag-gated native-stack diagnostic (Phase 0). Renders a Reanimated looping
 * fade over a Skia-drawn circle. Never shown in a normal run — mounted only
 * when EXPO_PUBLIC_MOTION_PROBE === "1". Its purpose is to prove, on-device,
 * that worklet animations and the Skia canvas both render. Safe to delete once
 * later phases exercise the same stack in real UI.
 */
export function MotionProbe(): JSX.Element {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [opacity]);

  const fade = useAnimatedStyle(() => {
    return { opacity: opacity.value };
  });

  return (
    <View style={styles.wrap} testID="motion-probe" pointerEvents="none">
      <Animated.View style={[styles.badge, fade]}>
        <Canvas style={styles.canvas}>
          <Fill color="transparent" />
          <Circle cx={20} cy={20} r={16} color="#00e5ff" />
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 60, right: 12, zIndex: 999 },
  badge: { width: 40, height: 40 },
  canvas: { width: 40, height: 40 },
});
