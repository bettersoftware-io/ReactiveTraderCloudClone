import type { JSX } from "react";
import { useRef } from "react";
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

  if (!visible) {
    return null;
  }

  return <BootOverlay dismiss={dismiss} />;
}

/** The splash overlay and the fade that lowers it.
 *
 * **This is a separate component so the fade's `Animated.Value` dies with the
 * splash.** `BootGate` itself never unmounts (it is rendered unconditionally by
 * `app/(app)/_layout.tsx`), so an opacity value held up there OUTLIVES every
 * raise — and the previous dismissal leaves it at 0. Replay then mounted the
 * overlay at native opacity 0: the ramp ran for its full ~5s completely
 * invisible over the live HUD, and the splash only appeared for a fraction of a
 * second at the very end, when starting the next fade re-synced the native
 * node. From the user's side: tap ⟳ Replay Boot, nothing happens for five
 * seconds, then a flash.
 *
 * A previous fix re-armed the value with `opacity.setValue(1)` from an effect on
 * every raise. The call happens — `BootGate.test.tsx` asserts it and passes —
 * but it does not reach the native node, so the bug survived the fix AND its
 * test. Mounting the value with the splash removes the stale-state class
 * outright instead of patching propagation.
 *
 * Both web clients are correct here for exactly this reason and never needed a
 * re-arm: their opacity lives in CSS on a `<div>` that is created fresh on each
 * raise (`.boot[data-done]`), so there is no value to go stale. This is the RN
 * equivalent of that structure. */
function BootOverlay({ dismiss }: BootOverlayProps): JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

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

  return (
    <Animated.View testID="boot-gate" style={[styles.overlay, { opacity }]}>
      <BootSequence onDone={dismissBoot} />
    </Animated.View>
  );
}

interface BootOverlayProps {
  readonly dismiss: () => void;
}

const FADE_MS = 320;

interface BootGateStyles {
  overlay: ViewStyle;
}

const styles: BootGateStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
});
