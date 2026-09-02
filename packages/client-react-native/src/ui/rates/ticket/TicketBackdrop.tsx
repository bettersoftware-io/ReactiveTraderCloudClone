// packages/client-react-native/src/ui/rates/ticket/TicketBackdrop.tsx
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  useBottomSheet,
} from "@gorhom/bottom-sheet";
import type { JSX } from "react";
import { Pressable, StyleSheet } from "react-native";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** The trade ticket's dimmed backdrop, in two arms — the second half of the
 * sheet's reduced-motion behaviour (`sheetPresentation` is the first).
 *
 * **Motion on** — the library's `BottomSheetBackdrop`, unchanged. It derives
 * its opacity by interpolating the sheet's `animatedIndex` across
 * `[-1, disappearsOnIndex, appearsOnIndex]`, so the scrim fades in with the
 * sheet and back out as it goes.
 *
 * **Motion off** (OS reduced-motion, or power-saver Freeze) — a STATIC layer
 * at the final tint the interpolation would reach, with the same tap-to-close
 * behaviour and the same accessibility affordances. Nothing about it is tied
 * to `animatedIndex`, so it neither fades in nor out.
 *
 * Both arms paint the theme's `bgOverlay` — the design's per-skin `--overlay`
 * (holo dark `rgba(0,6,10,0.78)`, dc.html:657) — not the library's default
 * black @ 0.5, which read visibly lighter than the prototype's scrim. The
 * token carries its own alpha, so the animated arm pins `opacity={1}` and
 * lets the fade run 0 → 1 over it.
 *
 * Being tied to the index at all is the point: with motion off the sheet no
 * longer animates to its resting position, but `enableDynamicSizing`
 * re-measures the content after first layout, and that re-measure still nudges
 * `animatedIndex` — so an index-interpolated scrim settles at its final tint a
 * frame or two after the content is already at rest. Invisible to the eye on
 * dark pixels; not invisible to a pixel comparison of the bright glyphs behind
 * it, which is how it was found (three ticket golden verifies drifting by
 * 0.005-0.0099% of pixels, all of it accent-coloured, with the sheet's own
 * edges byte-stable). A user who has asked for no motion should not be getting
 * a fading scrim either way. */
export function TicketBackdrop(props: BottomSheetBackdropProps): JSX.Element {
  const motionEnabled = useShellMotionEnabled();
  const { close } = useBottomSheet();
  const t = useTheme();

  function dismissSheet(): void {
    close();
  }

  if (motionEnabled) {
    return (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={APPEARS_ON_INDEX}
        disappearsOnIndex={DISAPPEARS_ON_INDEX}
        pressBehavior="close"
        opacity={1}
        style={[props.style, { backgroundColor: t.bgOverlay }]}
      />
    );
  }

  return (
    <Pressable
      testID="ticket-backdrop-static"
      style={[
        props.style,
        StyleSheet.absoluteFill,
        { backgroundColor: t.bgOverlay },
      ]}
      onPress={dismissSheet}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Bottom sheet backdrop"
      accessibilityHint="Tap to close the bottom sheet"
    />
  );
}

/** The single-detent sheet is fully out at index 0 and gone at -1 — the same
 * pair the animated arm is given, so both arms agree on what "shown" means. */
const APPEARS_ON_INDEX = 0;

const DISAPPEARS_ON_INDEX = -1;
