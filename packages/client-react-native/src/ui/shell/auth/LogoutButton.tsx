import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Signs the operator out: clears the session and returns to `LoginScreen` via
 * the `useAuth().logout()` seam — the RN analogue of the web `AccountMenu`
 * SIGN OUT row. Immediate, no confirmation, matching web.
 *
 * LIVES IN THE APPEARANCE SHEET, not the HUD header (P7). It sat in the header
 * beside `LockButton` on the reasoning that "RN has no AccountMenu, so the
 * toolbar carries it" — but the prototype's header
 * (`Reactive Trader Mobile.dc.html:88-94`) has exactly TWO controls, both
 * glyphs, and no sign-out at all. A third text affordance the design never
 * budgeted for is what pushed the row 5 points past a 402pt screen and clipped
 * it, which is doubly bad: the control that fell off the edge was this one.
 * The sheet is where the web client's account actions live too, so this is the
 * closer analogue as well as the one that fits. */
export function LogoutButton(): JSX.Element {
  const { useAuth } = useViewModel();
  const { logout } = useAuth();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="logout-button"
      accessibilityLabel="Sign out"
      style={styles.row}
      onPress={() => {
        logout();
      }}
    >
      <Text style={styles.label}>SIGN OUT</Text>
    </Pressable>
  );
}

interface LogoutButtonStyles {
  row: ViewStyle;
  label: TextStyle;
}

function makeStyles(t: RnTheme): LogoutButtonStyles {
  return StyleSheet.create({
    // A full-width sheet row now, matching `▸ REPLAY BOOT SEQUENCE` directly
    // above it, rather than the bare inline text a toolbar slot wanted.
    row: { paddingVertical: 12, alignItems: "center" },
    // `statusDisconnected`, not `textMuted`: in a sheet this is the only
    // destructive action on the screen, and it no longer has to stay quiet to
    // avoid competing with a neighbouring header control.
    label: {
      fontSize: 13,
      letterSpacing: 2,
      color: t.statusDisconnected,
      fontFamily: t.fontDisplay,
    },
  });
}
