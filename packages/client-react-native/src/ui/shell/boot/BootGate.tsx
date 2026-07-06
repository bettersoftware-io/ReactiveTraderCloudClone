import type { JSX } from "react";
import { useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  type ViewStyle,
} from "react-native";

import { BootSequence } from "#/ui/shell/boot/BootSequence";

interface BootGateProps {
  onFinished: () => void;
}

const FADE_MS = 320;

/** Full-screen boot overlay host. Renders the BootSequence splash on top of the
 * app (which mounts underneath so its streams warm during boot). When the boot
 * machine reports done (ramp complete or SKIP), fades the overlay out and then
 * calls `onFinished` so the host stops rendering it. Under reduce-motion the
 * fade is skipped (jump-cut) and `onFinished` fires at once. The web analogue
 * (BootGate.tsx) waits on a CSS `transitionend`; RN's Animated completion
 * callback is exact, so no equivalent event plumbing is needed. */
export function BootGate({ onFinished }: BootGateProps): JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  function handleDone(): void {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) {
          onFinished();
          return;
        }

        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => {
          onFinished();
        });
      })
      .catch(() => {
        // If the reduce-motion probe rejects, still dismiss — never strand the splash.
        onFinished();
      });
  }

  return (
    <Animated.View testID="boot-gate" style={[styles.overlay, { opacity }]}>
      <BootSequence onDone={handleDone} />
    </Animated.View>
  );
}

interface BootGateStyles {
  overlay: ViewStyle;
}

const styles: BootGateStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
});
