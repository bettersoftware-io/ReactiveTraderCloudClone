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
  AMBIENT_STYLES,
  type AmbientStyle,
  POWER_SAVER_LEVELS,
  type PowerSaverLevel,
  THEME_MODE_PREFERENCES,
  type ThemeMode,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import {
  cyclesToReach,
  SKIN_DISPLAY_ORDER,
} from "#/ui/shell/appearance/appearanceLayout";
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
  // still lands on the true target — guarded directly by
  // packages/client-core/src/presenters/__tests__/ThemePreferencePresenter.test.ts
  // ("cycle advances dark → light → system → dark from the live current
  // value"); `cyclesToReach` here only computes the step count.
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
        <View testID="appearance-skin-grid" style={styles.skinGrid}>
          {SKIN_DISPLAY_ORDER.map((s) => {
            const active = s === skin;
            const swatch = rnThemeTokens[s][mode];
            return (
              <View
                key={s}
                testID={`appearance-skin-${s}-cell`}
                style={styles.skinCardWrap}
              >
                <BlurCard mode={mode}>
                  <Pressable
                    testID={
                      active
                        ? `appearance-skin-${s}-active`
                        : `appearance-skin-${s}`
                    }
                    style={active ? styles.skinCardActive : styles.skinCard}
                    onPress={() => {
                      setSkin(s);
                    }}
                  >
                    <View
                      testID={`appearance-skin-${s}-swatch-row`}
                      style={styles.skinSwatchRow}
                    >
                      {/* Three sibling swatches deliberately share one
                          testID (getAllByTestId) — the three semantic
                          accents (primary/positive/negative), not the old
                          card's bgTile + accent2 pairing. The row itself
                          carries its own testID too, purely so
                          AppearanceScreen.test.tsx's derived swatch-overflow
                          invariant test can read its real `gap` off a live
                          rendered node instead of trusting the constant. */}
                      {SWATCH_ACCENT_KEYS.map((accentKey) => {
                        return (
                          <View
                            key={accentKey}
                            testID={`appearance-skin-${s}-swatch`}
                            style={[
                              styles.skinSwatch,
                              { backgroundColor: swatch[accentKey] },
                            ]}
                          />
                        );
                      })}
                    </View>
                    <Text
                      testID={`appearance-skin-${s}-label`}
                      style={styles.skinLabel}
                    >
                      {THEME_DISPLAY_NAME[s]}
                    </Text>
                  </Pressable>
                </BlurCard>
              </View>
            );
          })}
        </View>
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
            <View style={styles.toggleTextGroup}>
              <Text style={styles.toggleLabel}>Ambient background</Text>
              <Text style={styles.toggleSubtitle}>
                Aurora + HUD grid · GPU shader layer
              </Text>
            </View>
            <Text style={styles.toggleValue}>
              {ambientEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </BlurCard>
        {/* The only real branch on this screen. The style picker is
            meaningless while ambient is off (there is nothing to preview),
            so it must be genuinely ABSENT from the tree, not merely
            disabled — the paired hidden/shown tests in
            AppearanceScreen.test.tsx assert both directions against the
            same container id. Confirmed as a genuine RED: rendering this
            unconditionally first made the "HIDDEN" test fail for real
            (found the live element instead of null) before this gate was
            added back. */}
        {ambientEnabled ? (
          <BlurCard mode={mode}>
            <View testID="appearance-ambient-style" style={styles.segmented}>
              {AMBIENT_STYLES.map((style) => {
                const active = style === ambientStyle;
                return (
                  <Pressable
                    key={style}
                    testID={`appearance-ambient-style-${style}`}
                    style={active ? styles.segmentActive : styles.segment}
                    onPress={() => {
                      setStyle(style);
                    }}
                  >
                    <Text style={styles.segmentLabel}>
                      {AMBIENT_STYLE_LABEL[style]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </BlurCard>
        ) : null}
        {/* This segment renders through the SAME
            `styles.segmented`/`segment`/`segmentActive` objects as the mode
            segment above and the ambient style picker above that — one
            `StyleSheet.create` call, shared by reference, not three copies.
            The mode segment's own derived invariant test (below, in
            AppearanceScreen.test.tsx) already proves those objects give
            every cell `flex: 1` (equal division of the row, safe at any
            width, no wrap/clip threshold); the ambient picker relied on that
            same proof for its own 2-cell segment without adding a second
            copy of the test, and this segment follows that precedent rather
            than adding a third. */}
        <Text style={styles.label}>Power saver</Text>
        <BlurCard mode={mode}>
          <View style={styles.segmented}>
            {POWER_SAVER_LEVELS.map((level) => {
              return (
                <Pressable
                  key={level}
                  testID={`appearance-power-${level}`}
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

      {/* `replayButton` spreads `rowBase` (the same base the ambient toggle
          row above uses) with no fixed or percentage width and no
          `numberOfLines` cap — the label is one `Text` node in a full-width,
          height-auto row. A narrower device just grows the row and wraps the
          text onto a second line; there is no width at which it discretely
          clips or collapses, so — like the ambient toggle row's own text —
          this needs no derived invariant test. */}
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
            <Text style={styles.replayButtonText}>▸ REPLAY BOOT SEQUENCE</Text>
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

const AMBIENT_STYLE_LABEL: Record<AmbientStyle, string> = {
  aurora: "Aurora",
  rays: "Rays",
};

// The three semantic accents a skin card's swatch row renders, in display
// order. Single source for the three near-identical swatch Views: a fourth
// swatch or a reordering only needs updating here, not in three separate JSX
// blocks.
const SWATCH_ACCENT_KEYS: readonly (
  | "accentPrimary"
  | "accentPositive"
  | "accentNegative"
)[] = ["accentPrimary", "accentPositive", "accentNegative"];

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
  skinGrid: ViewStyle;
  skinCardWrap: ViewStyle;
  skinCard: ViewStyle;
  skinCardActive: ViewStyle;
  skinSwatchRow: ViewStyle;
  skinSwatch: ViewStyle;
  skinLabel: TextStyle;
  toggleRow: ViewStyle;
  toggleRowOn: ViewStyle;
  toggleTextGroup: ViewStyle;
  toggleLabel: TextStyle;
  toggleSubtitle: TextStyle;
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
    borderColor: t.borderSubtle,
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
      borderColor: t.borderSubtle,
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
    // 3x2 grid (Task 4): three cards per row. `flexWrap` only keeps three per
    // row while the row's content width comfortably clears
    // 3 * cardWidthPct + 2 * gap — a FIXED gap against a PERCENTAGE width
    // means that margin shrinks as the device narrows, so it has to be
    // checked, not assumed. At 31% width / gap 10 the no-wrap floor was a
    // 285.7pt container (317.7pt device with this file's 16px content
    // padding) — a 320pt device cleared it by 0.16pt, inside normal Yoga
    // sub-pixel rounding noise, and a `gap` raised from 10 to 12 alone would
    // have pushed the floor past 375pt and silently collapsed this to a 2x3
    // grid with every existing test (order/count/colour/press) still green
    // (Task 4 review, fix round 1). 30% moves the floor to a 200pt container
    // (232pt device) — see the derived invariant test in
    // AppearanceScreen.test.tsx, which asserts this margin rather than
    // trusting the constant.
    skinGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    skinCardWrap: { width: "30%" },
    skinCard: {
      alignItems: "center",
      padding: 12,
      gap: 8,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderSubtle,
    },
    // The ring is the design's only selection cue (the old check mark is
    // gone), so the active card's border is the one visible difference.
    skinCardActive: {
      alignItems: "center",
      padding: 12,
      gap: 8,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: 2,
      borderColor: t.accentPrimary,
    },
    // A SECOND, independent no-wrap-style threshold from `skinGrid`'s above:
    // this one is the card's own INNER content width (card width minus
    // `skinCard`'s `padding: 12` on both sides) against the swatch row's
    // INTRINSIC width (3 swatches + 2 gaps, both FIXED pixel amounts, unlike
    // the card width which is a percentage of the device). `skinGrid`'s
    // comment above only proves three cards fit per row; it says nothing
    // about whether the three swatches then fit INSIDE one of those cards —
    // that overflow is silent, too: `blurWrap` (BlurCard) sets `overflow:
    // "hidden"`, so a swatch row wider than its card just gets clipped, with
    // every order/count/colour/press test in this file still green (fix
    // round 2 review). At 18pt swatches / 6pt gap (66pt needed) the floor
    // was 332pt — ABOVE the 320pt floor `AppearanceScreen.test.tsx` already
    // asserts elsewhere in this same card grid, so a 320pt device would have
    // silently clipped the third swatch. 16pt / 4pt (56pt needed) moves the
    // floor to ~298.7pt, clearing 320pt with real margin — see the derived
    // invariant test in AppearanceScreen.test.tsx, which asserts this margin
    // from the live rendered styles rather than trusting these constants.
    //
    // 320pt was re-checked against real device support, not re-assumed: RN
    // 0.86's Podfile pins `min_ios_version_supported` to 15.1
    // (node_modules/react-native/scripts/cocoapods/helpers.rb), and iPhone SE
    // (1st generation) — 320x568pt, the narrowest iPhone Apple ever shipped —
    // is a supported iOS 15 device. So a 320pt device is a real, running
    // target for this app today, not a retired one; 320 stays the floor
    // rather than being widened to 375.
    skinSwatchRow: { flexDirection: "row", gap: 4 },
    skinSwatch: { width: 16, height: 16, borderRadius: 4 },
    skinLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      textAlign: "center",
    },
    toggleRow: rowBase,
    toggleRowOn: {
      ...rowBase,
      borderWidth: 1,
      borderColor: t.accentPrimary,
      backgroundColor: t.chip,
    },
    // `flexShrink: 1` (not the row's default 0) lets this column give up
    // width to its sibling `toggleValue` rather than force the row wider
    // than its container — the same "safe by construction" answer as the
    // mode segment's `flex: 1` cells, just on the shrink axis: the subtitle
    // wraps onto a second line instead of clipping or pushing ON/OFF off
    // the edge. No derived invariant test needed for this one (unlike the
    // skin grid's percentage-width/fixed-gap trap): wrapping text has no
    // wrap-vs-no-wrap threshold to silently cross, it just wraps.
    toggleTextGroup: { flexShrink: 1 },
    toggleLabel: {
      fontSize: 16,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    toggleSubtitle: {
      fontSize: 12,
      color: t.textMuted,
      fontFamily: t.fontDisplay,
      marginTop: 2,
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
