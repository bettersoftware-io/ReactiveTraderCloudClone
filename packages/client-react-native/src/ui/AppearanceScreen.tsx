// packages/client-react-native/src/ui/AppearanceScreen.tsx
import type { JSX } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  THEME_SKINS,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Appearance settings screen: a mode row that cycles dark → light →
 * system (reusing the ViewModel's `cycle()`), and a skin list that writes the
 * chosen skin. Both intents live behind the ViewModel; this only renders view
 * state and dispatches. */
export function AppearanceScreen(): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { modePreference, cycle } = useThemePreference();
  const { skin, setSkin } = useThemeSkinPreference();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      testID="appearance-panel"
      style={styles.panel}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.label}>Mode</Text>
        <Pressable
          testID="appearance-mode"
          style={styles.modeRow}
          onPress={() => {
            cycle();
          }}
        >
          <Text style={styles.modeValue}>{MODE_LABEL[modePreference]}</Text>
          <Text style={styles.modeHint}>Tap to change</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Skin</Text>
        {THEME_SKINS.map((s) => {
          const active = s === skin;
          return (
            <Pressable
              key={s}
              testID={
                active ? `appearance-skin-${s}-active` : `appearance-skin-${s}`
              }
              style={active ? styles.skinRowActive : styles.skinRow}
              onPress={() => {
                setSkin(s);
              }}
            >
              <Text style={styles.skinName}>{SKIN_LABEL[s]}</Text>
              {active ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const MODE_LABEL: Record<ThemeModePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const SKIN_LABEL: Record<ThemeSkin, string> = {
  classic: "Classic",
  holo: "Holo",
  holo3d: "Holo 3D",
  terminal: "Terminal",
  terminal3d: "Terminal 3D",
  neon: "Neon",
};

interface AppearanceScreenStyles {
  panel: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  label: TextStyle;
  modeRow: ViewStyle;
  modeValue: TextStyle;
  modeHint: TextStyle;
  skinRow: ViewStyle;
  skinRowActive: ViewStyle;
  skinName: TextStyle;
  check: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceScreenStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 24 },
    section: { gap: 8 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    modeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    modeValue: {
      fontSize: 16,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    modeHint: { fontSize: 12, color: t.textMuted },
    skinRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    skinRowActive: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.borderStrong,
    },
    skinName: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontDisplay },
    check: { fontSize: 16, color: t.accentPrimary },
  });
}
