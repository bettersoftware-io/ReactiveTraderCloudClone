import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that signs the operator out. RN has no header
 * AccountMenu, so the toolbar carries the sign-out control alongside
 * `LockButton`; it clears the session and returns to `LoginScreen` via the
 * `useAuth().logout()` seam — the RN analogue of the web `AccountMenu` SIGN OUT
 * row. Immediate, no confirmation, matching web. Styled `textMuted` so it reads
 * as secondary to the accent-coloured `Lock` (sign-out is the rarer action). */
export function LogoutButton(): JSX.Element {
  const { useAuth } = useViewModel();
  const { logout } = useAuth();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="logout-button"
      onPress={() => {
        logout();
      }}
    >
      <Text style={styles.label}>Sign out</Text>
    </Pressable>
  );
}

interface LogoutButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): LogoutButtonStyles {
  return StyleSheet.create({
    label: { color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
