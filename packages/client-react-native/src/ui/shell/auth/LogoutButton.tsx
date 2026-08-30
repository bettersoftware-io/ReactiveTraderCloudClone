import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Signs the operator out: clears the session and returns to `LoginScreen` via
 * the `useAuth().logout()` seam — the RN analogue of the web `AccountMenu`
 * SIGN OUT row. Immediate, no confirmation, matching web.
 *
 * LIVES IN THE APPEARANCE SHEET, not the HUD header (P7): the prototype's
 * header (`Reactive Trader Mobile.dc.html:88-94`) carries exactly TWO
 * controls, both glyphs, and no sign-out at all — a third text affordance the
 * design never budgeted for is what pushed that row 5 points past a 402pt
 * screen and clipped it. The sheet is where the web client's account actions
 * live too, so it is the closer analogue as well as the one that fits. */
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
    // The sheet's outline-action frame, shared with `▸ REPLAY BOOT SEQUENCE`
    // above it (the design's `border:1px solid var(--border);
    // border-radius:10px;padding:12px 0`), so the two full-width actions read
    // as one family rather than a button and a bare text link.
    row: {
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      marginTop: 18,
    },
    // `accentNegative`, not `textMuted`: in a sheet this is the only
    // destructive action on the screen, and it no longer has to stay quiet to
    // avoid competing with a neighbouring header control. Type matches the
    // replay action beside it — the design's 10px tracked mono.
    label: {
      ...labelStyle(t, 10, 2),
      color: t.accentNegative,
    },
  });
}
