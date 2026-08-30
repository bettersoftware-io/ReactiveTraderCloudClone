// packages/client-react-native/src/ui/rates/ticket/TicketBackdrop.tsx
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  useBottomSheet,
} from "@gorhom/bottom-sheet";
import type { JSX } from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

/** The trade ticket's dimmed backdrop, in two arms — the second half of the
 * sheet's reduced-motion behaviour (`sheetPresentation` is the first).
 *
 * **Motion on** — the library's `BottomSheetBackdrop`, unchanged. It derives
 * its opacity by interpolating the sheet's `animatedIndex` across
 * `[-1, disappearsOnIndex, appearsOnIndex]`, so the scrim fades in with the
 * sheet and back out as it goes.
 *
 * **Motion off** (OS reduced-motion, or power-saver Freeze) — a STATIC layer
 * at the final opacity the interpolation would reach, painted the same black
 * at the same 0.5 the library's defaults produce, with the same tap-to-close
 * behaviour and the same accessibility affordances. Nothing about it is tied
 * to `animatedIndex`, so it neither fades in nor out.
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
      />
    );
  }

  return (
    <Pressable
      testID="ticket-backdrop-static"
      style={[props.style, StyleSheet.absoluteFill, styles.scrim]}
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

interface TicketBackdropStyles {
  scrim: ViewStyle;
}

/** The exact resting appearance of `BottomSheetBackdrop` under this sheet's
 * props: its own `styles.backdrop` is `backgroundColor: "black"`, and with no
 * `opacity` prop it interpolates up to the library's `DEFAULT_OPACITY` of 0.5.
 * Restated as literals rather than imported — they are the library's internal
 * constants, not exports. A theme token would be wrong here: the two arms must
 * paint the SAME scrim, and only one of them is ours. */
const styles: TicketBackdropStyles = StyleSheet.create({
  scrim: { backgroundColor: "black", opacity: 0.5 },
});
