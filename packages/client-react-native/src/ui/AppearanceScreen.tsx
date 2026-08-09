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
  POWER_SAVER_LEVELS,
  type PowerSaverLevel,
  THEME_MODE_PREFERENCES,
  THEME_SKINS,
  type ThemeMode,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { cyclesToReach } from "#/ui/shell/appearance/appearanceLayout";
import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Appearance settings screen: an APPEARANCE header with a single 3-way
 * dark/light/system mode segment (replacing the old title-label + tap-to-cycle
 * row + 2-way segment — two controls for one setting collapsed to one), theme
 * cards (swatch + name) for the six skins, an ambient toggle, a three-level
 * power-saver control, a replay-boot action, and sign-out (moved here from the
 * HUD header by P7). All state and every write is behind the ViewModel; this
 * only renders view state and dispatches the exposed intents — no direct
 * storage, no domain writes. */
export function AppearanceScreen({
  onReplayBoot,
}: AppearanceScreenProps = {}): JSX.Element {
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

  // P5: a THREE-state segmented control, mirroring the web's. This was a
  // 2-state Off/On toggle that could only reach "calm", with Freeze "deferred
  // to a later mobile-UI phase" — which is why the item was recorded as
  // "Freeze renders the same as Calm on RN". That description pointed at the
  // wrong layer: the gates honour Freeze throughout (54 files read
  // `useShellMotionEnabled`/`useBootMotionEnabled`/`isFreeze`, and the visual
  // harness seeds `freeze` directly — that is how `boot/static` is pinned).
  // The plumbing was never missing; the CONTROL simply could not select the
  // level, so no phone user could ever reach it.
  const { level: powerSaverLevel, setLevel: setPowerSaverLevel } =
    usePowerSaver();
  const { style: ambientStyle, setStyle } = useAmbientStyle();
  const { reboot } = useBootGate();
  const styles = useThemedStyles(makeStyles);

  // The ViewModel exposes no direct mode setter — UseThemePreferenceResult is
  // { mode, modePreference, cycle } only (createViewModel.ts) — so "jump to a
  // mode" (dark/light/system) is expressed as N zero-arg cycle() calls.
  // cycle() re-reads the live persisted preference on every call (not a
  // captured render value), so firing it synchronously N times in a row
  // still lands on the true target.
  function jumpToMode(target: ThemeModePreference): void {
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
      {/* One 3-way segment replaces the old title + tap-to-cycle row + 2-way
          segment (two controls for one setting). The design's own header row
          (dev-handoff standalone HTML, "appearance sheet" block) places a
          2-way DARK/LIGHT segment inline beside the APPEARANCE title and
          fits — but it has no SYSTEM option, so there is no real measurement
          for a 3-way segment at that width. Rather than guess at the extra
          cell's fit (the class of error that produced P8), the segment sits
          on its own row beneath the title, which is safe by construction at
          any width. */}
      <View testID="appearance-mode-section" style={styles.section}>
        <Text style={styles.headerTitle}>APPEARANCE</Text>
        <BlurCard mode={mode}>
          <View style={styles.segmented}>
            {THEME_MODE_PREFERENCES.map((target) => {
              const active = modePreference === target;
              return (
                <Pressable
                  key={target}
                  testID={`appearance-mode-${target}`}
                  style={active ? styles.segmentActive : styles.segment}
                  onPress={() => {
                    jumpToMode(target);
                  }}
                >
                  <Text style={styles.segmentLabel}>{MODE_LABEL[target]}</Text>
                </Pressable>
              );
            })}
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
          <View style={styles.segmented}>
            {POWER_SAVER_LEVELS.map((level) => {
              return (
                <Pressable
                  key={level}
                  testID={`appearance-powersaver-${level}`}
                  style={
                    powerSaverLevel === level
                      ? styles.segmentActive
                      : styles.segment
                  }
                  onPress={() => {
                    setPowerSaverLevel(level);
                  }}
                >
                  <Text style={styles.segmentLabel}>
                    {POWER_SAVER_LABELS[level]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BlurCard>
        <Text style={styles.toggleCaption}>
          {POWER_SAVER_CAPTIONS[powerSaverLevel]}
        </Text>
      </View>

      <View style={styles.section}>
        <BlurCard mode={mode}>
          <Pressable
            testID="appearance-replay-boot"
            style={styles.replayButton}
            onPress={() => {
              reboot();
              // The splash renders BEHIND this sheet, which is an opaque
              // full-screen overlay — raise it without telling the host and the
              // whole boot sequence plays, and finishes, unseen. That is what
              // "Replay Boot never worked" actually looked like.
              onReplayBoot?.();
            }}
          >
            <Text style={styles.replayButtonText}>⟳ Replay Boot</Text>
          </Pressable>
        </BlurCard>
      </View>

      {/* Sign-out lives here rather than in the HUD header (P7): the
          prototype's header carries exactly two glyph controls and no
          sign-out, and the third text affordance is what pushed that row off
          the edge of the screen. Last section deliberately — it is the only
          destructive action on the sheet, so it sits below everything
          reversible. */}
      <View style={styles.section}>
        <BlurCard mode={mode}>
          <LogoutButton />
        </BlurCard>
      </View>
    </ScrollView>
  );
}

/** The prototype names the levels rather than showing a switch, because three
 * states cannot be an on/off affordance. */
const POWER_SAVER_LABELS: Record<PowerSaverLevel, string> = {
  off: "Off",
  calm: "Calm",
  freeze: "Freeze",
};

/** Each level earns its own caption: "reduces motion" and "stops all motion"
 * are different promises, and Freeze's is the one worth stating plainly, since
 * a user who picks it and still sees movement has found a bug. */
const POWER_SAVER_CAPTIONS: Record<PowerSaverLevel, string> = {
  off: "All motion and ambient effects run normally.",
  calm: "Reduces motion & re-renders; ambient effects stay.",
  freeze: "Stops all motion, including the boot splash and ambient layer.",
};

interface AppearanceScreenProps {
  /** Slot: fired after the boot splash is re-raised, so a host that covers the
   * screen (the Appearance overlay) can get out of its way. Optional — the
   * screen is also mounted standalone, where there is nothing to dismiss. */
  readonly onReplayBoot?: () => void;
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
  headerTitle: TextStyle;
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
    // Matches the design's own header ("appearance sheet" block, dev-handoff
    // standalone HTML): font-size 14px, font-weight 600, letter-spacing
    // 1.5px. Title case rather than CSS text-transform, matching the file's
    // existing convention of literal-uppercase display strings (see
    // THEME_DISPLAY_NAME above).
    headerTitle: {
      fontSize: 14,
      fontWeight: "600",
      letterSpacing: 1.5,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
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
