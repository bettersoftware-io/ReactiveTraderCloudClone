import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that opens the Appearance overlay. RN has no header
 * settings menu, so the toolbar carries the control (mirrors `LockButton`). */
export function AppearanceButton({
  onPress,
}: AppearanceButtonProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="appearance-button"
      accessibilityLabel="Appearance"
      onPress={onPress}
    >
      <Text style={styles.label}>Theme</Text>
    </Pressable>
  );
}

interface AppearanceButtonProps {
  onPress: () => void;
}

interface AppearanceButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceButtonStyles {
  return StyleSheet.create({
    label: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
