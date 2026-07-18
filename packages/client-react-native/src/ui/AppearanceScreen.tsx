// packages/client-react-native/src/ui/AppearanceScreen.tsx
import { BlurView } from "expo-blur";
import type { JSX, ReactNode } from "react";
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
  THEME_MODE_PREFERENCES,
  THEME_SKINS,
  type ThemeMode,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Appearance settings screen: a mode row (tap-to-cycle, unchanged) plus a
 * segmented dark/light control, theme cards (swatch + name) for the six
 * skins, ambient + power-saver toggles, and a replay-boot action. All state
 * and every write is behind the ViewModel; this only renders view state and
 * dispatches the exposed intents — no direct storage, no domain writes. */
export function AppearanceScreen(): JSX.Element {
  const {
    useThemePreference,
    useThemeSkinPreference,
    useAnimatedBackground,
    usePowerSaver,
    useAmbientStyle,
    useBootGate,
  } = useViewModel();
  const { mode, modePreference, cycle } = useThemePreference();
  const { skin, setSkin } = useThemeSkinPreference();
  const { enabled: ambientEnabled, setEnabled: setAmbientEnabled } =
    useAnimatedBackground();

  // The mobile screen stays a 2-state toggle (Off/On) — it never reaches
  // Freeze (deferred to a later mobile-UI phase); `isCalm` (level !== "off")
  // is the boolean it needs, and toggling flips between "off" and "calm".
  const { isCalm: powerSaverEnabled, setLevel: setPowerSaverLevel } =
    usePowerSaver();
  const { style: ambientStyle, setStyle } = useAmbientStyle();
  const { reboot } = useBootGate();
  const styles = useThemedStyles(makeStyles);

  // The ViewModel exposes no direct mode setter — UseThemePreferenceResult is
  // { mode, modePreference, cycle } only (createViewModel.ts) — so "jump to
  // dark/light" is expressed as N zero-arg cycle() calls. cycle() re-reads the
  // live persisted preference on every call (not a captured render value), so
  // firing it synchronously N times in a row still lands on the true target.
  function jumpToMode(target: "dark" | "light"): void {
    const steps = cyclesToReach(modePreference, target);

    for (let i = 0; i < steps; i += 1) {
      cycle();
    }
  }

  return (
    <ScrollView
      testID="appearance-panel"
      style={styles.panel}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.label}>Mode</Text>
        <BlurCard mode={mode}>
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
        </BlurCard>
        <BlurCard mode={mode}>
          <View style={styles.segmented}>
            <Pressable
              testID="appearance-mode-dark"
              style={
                modePreference === "dark"
                  ? styles.segmentActive
                  : styles.segment
              }
              onPress={() => {
                jumpToMode("dark");
              }}
            >
              <Text style={styles.segmentLabel}>Dark</Text>
            </Pressable>
            <Pressable
              testID="appearance-mode-light"
              style={
                modePreference === "light"
                  ? styles.segmentActive
                  : styles.segment
              }
              onPress={() => {
                jumpToMode("light");
              }}
            >
              <Text style={styles.segmentLabel}>Light</Text>
            </Pressable>
          </View>
        </BlurCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Skin</Text>
        {THEME_SKINS.map((s) => {
          const active = s === skin;
          const swatch = rnThemeTokens[s][mode];
          return (
            <BlurCard key={s} mode={mode}>
              <Pressable
                testID={
                  active
                    ? `appearance-skin-${s}-active`
                    : `appearance-skin-${s}`
                }
                style={active ? styles.skinRowActive : styles.skinRow}
                onPress={() => {
                  setSkin(s);
                }}
              >
                <View style={styles.skinPreviewRow}>
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: swatch.bgTile,
                        borderColor: swatch.borderStrong,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatch.accentPrimary },
                      ]}
                    />
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatch.accent2 },
                      ]}
                    />
                  </View>
                  <Text style={styles.skinName}>{THEME_DISPLAY_NAME[s]}</Text>
                </View>
                {active ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            </BlurCard>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Motion</Text>
        <BlurCard mode={mode}>
          <Pressable
            testID="appearance-ambient-toggle"
            style={ambientEnabled ? styles.toggleRowOn : styles.toggleRow}
            onPress={() => {
              setAmbientEnabled(!ambientEnabled);
            }}
          >
            <Text style={styles.toggleLabel}>Ambient background</Text>
            <Text style={styles.toggleValue}>
              {ambientEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </BlurCard>
        <BlurCard mode={mode}>
          <View style={styles.segmented}>
            <Pressable
              testID="appearance-ambient-aurora"
              style={
                ambientStyle === "aurora"
                  ? styles.segmentActive
                  : styles.segment
              }
              onPress={() => {
                setStyle("aurora");
              }}
            >
              <Text style={styles.segmentLabel}>Aurora</Text>
            </Pressable>
            <Pressable
              testID="appearance-ambient-rays"
              style={
                ambientStyle === "rays" ? styles.segmentActive : styles.segment
              }
              onPress={() => {
                setStyle("rays");
              }}
            >
              <Text style={styles.segmentLabel}>Rays</Text>
            </Pressable>
          </View>
        </BlurCard>
        <BlurCard mode={mode}>
          <Pressable
            testID="appearance-powersaver-toggle"
            style={powerSaverEnabled ? styles.toggleRowOn : styles.toggleRow}
            onPress={() => {
              setPowerSaverLevel(powerSaverEnabled ? "off" : "calm");
            }}
          >
            <Text style={styles.toggleLabel}>Power saver</Text>
            <Text style={styles.toggleValue}>
              {powerSaverEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </BlurCard>
        <Text style={styles.toggleCaption}>
          Power saver reduces motion & re-renders.
        </Text>
      </View>

      <View style={styles.section}>
        <BlurCard mode={mode}>
          <Pressable
            testID="appearance-replay-boot"
            style={styles.replayButton}
            onPress={() => {
              reboot();
            }}
          >
            <Text style={styles.replayButtonText}>⟳ Replay Boot</Text>
          </Pressable>
        </BlurCard>
      </View>
    </ScrollView>
  );
}

/** Number of forward zero-arg cycle() steps (dark → light → system → dark)
 * needed to land the live preference on `target`, from `current`. */
function cyclesToReach(
  current: ThemeModePreference,
  target: "dark" | "light",
): number {
  const from = THEME_MODE_PREFERENCES.indexOf(current);
  const to = THEME_MODE_PREFERENCES.indexOf(target);
  return (
    (to - from + THEME_MODE_PREFERENCES.length) % THEME_MODE_PREFERENCES.length
  );
}

interface BlurCardProps {
  mode: ThemeMode;
  children: ReactNode;
}

/** Frosted-glass wrapper: `panel` tokens are translucent (Task 1), so card
 * rows are painted over a real blur rather than a flat colour. The blur sits
 * behind `children` (RN z-orders by render order), clipped to the same
 * rounded rect the row content draws. */
function BlurCard({ mode, children }: BlurCardProps): JSX.Element {
  return (
    <View style={cardStyles.blurWrap}>
      <BlurView intensity={30} tint={mode} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  blurWrap: { borderRadius: 8, overflow: "hidden" },
});

const MODE_LABEL: Record<ThemeModePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

// Display names ported from docs/design/mobile/v1/dev-handoff/theme-tokens.ts
// (THEMES map's `name` field), matching the prototype's uppercase header
// typography — same porting convention as rnThemeTokens itself (tokens.ts:49).
const THEME_DISPLAY_NAME: Record<ThemeSkin, string> = {
  classic: "CLASSIC",
  holo: "HOLO HUD",
  holo3d: "HOLO 3D",
  terminal: "TERMINAL",
  terminal3d: "TERMINAL 3D",
  neon: "NEON",
};

interface AppearanceScreenStyles {
  panel: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  label: TextStyle;
  modeRow: ViewStyle;
  modeValue: TextStyle;
  modeHint: TextStyle;
  segmented: ViewStyle;
  segment: ViewStyle;
  segmentActive: ViewStyle;
  segmentLabel: TextStyle;
  skinRow: ViewStyle;
  skinRowActive: ViewStyle;
  skinPreviewRow: ViewStyle;
  swatch: ViewStyle;
  swatchDot: ViewStyle;
  skinName: TextStyle;
  check: TextStyle;
  toggleRow: ViewStyle;
  toggleRowOn: ViewStyle;
  toggleLabel: TextStyle;
  toggleValue: TextStyle;
  toggleCaption: TextStyle;
  replayButton: ViewStyle;
  replayButtonText: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceScreenStyles {
  const rowBase: ViewStyle = {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: t.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  };

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
    modeRow: rowBase,
    modeValue: {
      fontSize: 16,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    modeHint: { fontSize: 12, color: t.textMuted },
    segmented: {
      flexDirection: "row",
      backgroundColor: t.panel,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
    },
    segmentActive: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: t.chip,
      borderWidth: 1,
      borderColor: t.accentPrimary,
    },
    segmentLabel: {
      fontSize: 14,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    skinRow: rowBase,
    skinRowActive: { ...rowBase, borderWidth: 1, borderColor: t.borderStrong },
    skinPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
    },
    swatchDot: { width: 8, height: 8, borderRadius: 4 },
    skinName: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontDisplay },
    check: { fontSize: 16, color: t.accentPrimary },
    toggleRow: rowBase,
    toggleRowOn: {
      ...rowBase,
      borderWidth: 1,
      borderColor: t.accentPrimary,
      backgroundColor: t.chip,
    },
    toggleLabel: {
      fontSize: 16,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    toggleValue: {
      fontSize: 12,
      fontWeight: "600",
      color: t.accentPrimary,
    },
    toggleCaption: { fontSize: 12, color: t.textMuted },
    replayButton: {
      ...rowBase,
      justifyContent: "center",
    },
    replayButtonText: {
      fontSize: 16,
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
    },
  });
}
