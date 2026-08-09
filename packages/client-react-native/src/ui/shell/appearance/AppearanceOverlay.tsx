import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { ComponentRef, JSX } from "react";
import { useEffect, useRef } from "react";
import { StyleSheet, type ViewStyle } from "react-native";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Appearance overlay, presented as a `@gorhom/bottom-sheet` modal — mobile-v1
 * parity with the design's grab-handle sheet, replacing the old full-screen
 * `View` with its own `CLOSE ✕` header. The handle, a backdrop tap and
 * pan-down-to-dismiss now carry the closing job the button used to; idiom
 * copied from `TradeTicketSheet` (`BottomSheetModal` + `backdropComponent` +
 * `handleIndicatorStyle`). `BottomSheetModalProvider` already wraps the app
 * body in `app/(app)/_layout.tsx` — no provider here.
 *
 * Renders nothing when closed (mirrors the old `if (!open) return null`
 * contract `tests/visual/scenarios.tsx` pins the sheet open through), and
 * mounts + presents the sheet in the same pass while open — there is no
 * separately-driven "closing" animation on the `open`-flips-false edge, same
 * as the overlay it replaces. */
export function AppearanceOverlay({
  open,
  onClose,
}: AppearanceOverlayProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);
  const sheetRef = useRef<ComponentRef<typeof BottomSheetModal>>(null);

  // `AppearanceOverlay` itself stays mounted for the app's lifetime (`open`
  // just toggles); the `if (!open) return null` branch below is what mounts
  // and unmounts the `BottomSheetModal` subtree. An empty-deps effect would
  // only ever fire once, at THIS component's own mount — almost always while
  // still closed — and never again on a later open. Keying on `open` re-runs
  // it each time the sheet freshly mounts, after the ref has attached.
  useEffect(() => {
    if (open) {
      sheetRef.current?.present();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={onClose}
      backdropComponent={AppearanceBackdrop}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
    >
      <BottomSheetView testID="appearance-sheet" style={styles.body}>
        <AppearanceScreen onReplayBoot={onClose} />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

interface AppearanceOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** Near-full-height: `AppearanceScreen` is a long settings scroll, not a
 * compact ticket — `TradeTicketSheet`'s `enableDynamicSizing` fits content
 * height instead, which would fight the screen's own `ScrollView`. */
const SNAP_POINTS = ["92%"];

// Private: dimmed backdrop, dismissing the sheet on press — TradeTicketSheet's
// idiom. Not exported — rtc/component-newspaper permits private subcomponents
// below the lede.
function AppearanceBackdrop(props: BottomSheetBackdropProps): JSX.Element {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

interface AppearanceOverlayStyles {
  handleIndicator: ViewStyle;
  background: ViewStyle;
  body: ViewStyle;
}

function makeStyles(t: RnTheme): AppearanceOverlayStyles {
  return StyleSheet.create({
    handleIndicator: { backgroundColor: t.border },
    background: { backgroundColor: t.bgPrimary },
    body: { flex: 1 },
  });
}
