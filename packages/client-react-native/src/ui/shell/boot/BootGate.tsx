import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";

/** Full-screen boot overlay host. Renders the BootSequence splash on top of the
 * app (which mounts underneath so its streams warm during boot). When the boot
 * machine reports done (ramp complete or SKIP), fades the overlay out and then
 * lowers the splash through the `useBootGate` seam. Under reduce-motion the
 * fade is skipped (jump-cut) and the dismiss fires at once. The web analogue
 * (client-react BootGate.tsx) waits on a CSS `transitionend`; RN's Animated
 * completion callback is exact, so no equivalent event plumbing is needed.
 *
 * **Visibility lives in the seam, not in the host.** It used to be a `bootDone`
 * `useState` in `app/(app)/_layout.tsx`, which made the Appearance sheet's
 * ⟳ Replay Boot a no-op on RN: `reboot()` re-raised `BootGatePresenter.visible$`
 * and nothing on this client subscribed to it, so the flag flipped and the
 * splash never came back. Reading `visible` here — the shape client-react has
 * always used — is what makes replay work, and keeps the one-shot
 * `shouldPlayBootSplash()` decision where it belongs (seeded into the presenter
 * at composition through the `bootSplash` port). */
export function BootGate(): JSX.Element | null {
  const { useBootGate } = useViewModel();
  const { visible, dismiss } = useBootGate();
  const opacity = useRef(new Animated.Value(1)).current;

  // Re-arm the fade for every raise. This component no longer unmounts between
  // boots — visibility is the seam's now — so the `Animated.Value` outlives the
  // splash it faded out, and a replay would otherwise re-render the overlay at
  // the opacity 0 the previous dismissal left behind: mounted, ramping,
  // completely invisible. Found on device; the splash simply never appeared
  // again, with nothing in the tree to suggest why.
  useEffect(() => {
    if (visible) {
      opacity.setValue(1);
    }
  }, [visible, opacity]);

  function dismissBoot(): void {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) {
          dismiss();
          return;
        }

        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => {
          dismiss();
        });
      })
      .catch(() => {
        // If the reduce-motion probe rejects, still dismiss — never strand the splash.
        dismiss();
      });
  }

  if (!visible) {
    return null;
  }

  return (
    <Animated.View testID="boot-gate" style={[styles.overlay, { opacity }]}>
      <BootSequence onDone={dismissBoot} />
    </Animated.View>
  );
}

const FADE_MS = 320;

interface BootGateStyles {
  overlay: ViewStyle;
}

const styles: BootGateStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
});
