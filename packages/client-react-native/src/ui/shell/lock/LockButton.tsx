import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that locks the session. RN has no header AccountMenu, so
 * the toolbar carries the lock control; it raises the LockScreen overlay via
 * the reused `useAuth().lock()` seam. */
export function LockButton(): JSX.Element {
  const { useAuth } = useViewModel();
  const { lock } = useAuth();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="lock-button"
      onPress={() => {
        lock();
      }}
    >
      <Text style={styles.label}>Lock</Text>
    </Pressable>
  );
}

interface LockButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): LockButtonStyles {
  return StyleSheet.create({
    label: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
