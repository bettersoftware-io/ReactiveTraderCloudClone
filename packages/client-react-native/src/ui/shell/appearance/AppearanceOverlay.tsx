import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen Appearance overlay. Renders nothing when closed; while open it
 * covers the shell — an absolute-fill <View> (NOT an RN Modal: Modal-via-press
 * segfaults under x86 jest) — with a close control above the existing
 * `AppearanceScreen`. zIndex 150 sits below `LockScreen` (200). */
export function AppearanceOverlay({
  open,
  onClose,
}: AppearanceOverlayProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);

  if (!open) {
    return null;
  }

  return (
    <View testID="appearance-overlay" style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.title}>APPEARANCE</Text>
        <Pressable testID="appearance-close" onPress={onClose}>
          <Text style={styles.close}>CLOSE ✕</Text>
        </Pressable>
      </View>
      <AppearanceScreen />
    </View>
  );
}

interface AppearanceOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface AppearanceOverlayStyles {
  overlay: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  close: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceOverlayStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 150,
      elevation: 150,
      backgroundColor: t.bgPrimary,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    title: {
      fontSize: 14,
      letterSpacing: 2,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    close: { fontSize: 13, color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
