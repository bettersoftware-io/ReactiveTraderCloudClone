import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import type { ComponentRef, JSX } from "react";
import { useEffect, useRef } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Appearance overlay, presented as a `@gorhom/bottom-sheet` modal — mobile-v1
 * parity with the design's grab-handle sheet. The handle, a backdrop tap and
 * pan-down-to-dismiss carry the closing job; idiom copied from
 * `TradeTicketSheet` (`BottomSheetModal` + `backdropComponent` +
 * `backgroundComponent` + `handleIndicatorStyle`). `BottomSheetModalProvider`
 * already wraps the app body in `app/(app)/_layout.tsx` — no provider here.
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
      backgroundComponent={AppearanceBackground}
      handleIndicatorStyle={styles.handleIndicator}
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

/** The design's sheet stops around 55% of the screen, but it carries four
 * fewer controls than this app does (a third mode cell, the ambient-style
 * picker, the three-level power saver, sign out). 80% is that height plus the
 * kept stack; the sheet is translucent and blurred either way, so the grid
 * behind still reads through as it does in the prototype shot. */
const SNAP_POINTS = ["80%"];

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

// Private: the sheet's own chrome — the design's
// `background:var(--panel);backdrop-filter:blur(16px);border-top:1px solid
// var(--border-strong);border-radius:18px 18px 0 0`. `t.panel` is a
// translucent token whose design contract IS "translucent panel + blur", and
// RN has no `backdrop-filter`, so this layers an `expo-blur` `BlurView` under
// a `t.panel`-tinted overlay, clipped to the top corner radius — the same
// construction `TradeTicketSheet`'s own background uses. Tint follows the
// resolved light/dark mode rather than being pinned dark, since this sheet is
// where a user switches between them.
function AppearanceBackground({
  style,
}: BottomSheetBackgroundProps): JSX.Element {
  const { useThemePreference } = useViewModel();
  const { mode } = useThemePreference();
  const t = useTheme();

  return (
    <View
      style={[
        style,
        backgroundStyles.chrome,
        { borderTopColor: t.borderStrong },
      ]}
    >
      <BlurView intensity={16} tint={mode} style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: t.panel }]}
      />
    </View>
  );
}

const backgroundStyles = StyleSheet.create({
  chrome: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    overflow: "hidden",
  },
});

interface AppearanceOverlayStyles {
  handleIndicator: ViewStyle;
  body: ViewStyle;
}

function makeStyles(t: RnTheme): AppearanceOverlayStyles {
  return StyleSheet.create({
    // Design: `width:38px;height:4px;border-radius:2px;background:var(--border)`.
    handleIndicator: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.borderPrimary,
    },
    body: { flex: 1 },
  });
}
