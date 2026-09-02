// packages/client-react-native/src/ui/AppearanceScreen.tsx
import type { JSX } from "react";
import {
  Pressable,
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
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { type PillSegment, SegmentedPill } from "#/ui/SegmentedPill";
import {
  cyclesToReach,
  SKIN_DISPLAY_ORDER,
} from "#/ui/shell/appearance/appearanceLayout";
import { SheetSwitch } from "#/ui/shell/appearance/SheetSwitch";
import { ThemeModePill } from "#/ui/shell/appearance/ThemeModePill";
import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { labelStyle } from "#/ui/theme/labelStyle";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The Appearance sheet's content, dressed as the mobile-v1 prototype's own
 * appearance sheet (`Reactive Trader Mobile.dc.html`, appearance-sheet block).
 *
 * The design's four rows come first, in the design's order and contiguously,
 * so the top of the sheet reads as the reference shot: the APPEARANCE title
 * with the mode pill inline beside it, the 3x2 theme-card grid (each card
 * previewing its OWN skin's background and accents), the ambient-background
 * row with a real pill switch, and `▸ REPLAY BOOT SEQUENCE`.
 *
 * Four controls the design has no equivalent of then follow, below all of it,
 * dressed in the same idiom rather than dropped: the mode pill's third `AUTO`
 * cell (inline, since it belongs to that control), the Aurora/Rays ambient
 * style picker, the Off/Calm/Freeze power-saver segment — the only way a
 * phone user can reach Freeze at all — and Sign out. That is what makes the
 * sheet taller than the design's ~55%; it is translucent and blurred
 * (`AppearanceOverlay`), so the grid behind still reads through, as in the
 * prototype shot.
 *
 * All state and every write stays behind the ViewModel; this renders view
 * state and dispatches the exposed intents — no direct storage, no domain
 * writes. */
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

  function replayBoot(): void {
    reboot();
    // The splash renders BEHIND this sheet, so raising it without telling the
    // host means the whole boot sequence plays, and finishes, unseen. That is
    // what "Replay Boot never worked" actually looked like.
    onReplayBoot?.();
  }

  return (
    <View testID="appearance-panel" style={styles.panel}>
      {/* The design puts the title and the mode selector on ONE row. The
          third AUTO cell is what made that a real measurement rather than a
          copy: `ThemeModePill`'s cells are intrinsically sized and this
          title carries `flexShrink: 1`, so the title — never the pill — is
          what gives way on a narrow screen. Asserted from live styles in
          AppearanceScreen.test.tsx. */}
      <View testID="appearance-mode-section" style={styles.headerRow}>
        <Text style={styles.headerTitle}>APPEARANCE</Text>
        <ThemeModePill value={modePreference} onSelect={jumpToMode} />
      </View>

      <View testID="appearance-skin-grid" style={styles.skinGrid}>
        {SKIN_DISPLAY_ORDER.map((s) => {
          const active = s === skin;
          // The card previews the skin it OFFERS, not the one in force: the
          // design fills each card with that skin's own `bg` and paints its
          // name in that skin's own accent (active) or dim (inactive). Only
          // the card's BORDER and glow come from the live theme.
          const preview = rnThemeTokens[s][mode];

          return (
            <View
              key={s}
              testID={`appearance-skin-${s}-cell`}
              style={styles.skinCardWrap}
            >
              <Pressable
                testID={
                  active
                    ? `appearance-skin-${s}-active`
                    : `appearance-skin-${s}`
                }
                style={[
                  active ? styles.skinCardActive : styles.skinCard,
                  { backgroundColor: preview.bgPrimary },
                ]}
                onPress={() => {
                  setSkin(s);
                }}
              >
                <View
                  testID={`appearance-skin-${s}-swatch-row`}
                  style={styles.skinSwatchRow}
                >
                  {/* Three sibling swatches deliberately share one testID
                      (getAllByTestId) — the three semantic accents. The row
                      itself carries its own testID too, purely so
                      AppearanceScreen.test.tsx's derived swatch-overflow
                      invariant test can read its real `gap` off a live
                      rendered node instead of trusting the constant. */}
                  {SWATCHES.map((swatch) => {
                    return (
                      <View
                        key={swatch.accentKey}
                        testID={`appearance-skin-${s}-swatch`}
                        style={[
                          styles.skinSwatch,
                          {
                            width: swatch.width,
                            backgroundColor: preview[swatch.accentKey],
                          },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text
                  testID={`appearance-skin-${s}-label`}
                  style={[
                    styles.skinLabel,
                    {
                      color: active
                        ? preview.accentPrimary
                        : preview.textSecondary,
                    },
                  ]}
                >
                  {THEME_DISPLAY_NAME[s]}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Inert row, pressable switch — the design's own division of labour.
          The switch keeps the `appearance-ambient-toggle` id the row used to
          carry, so the press still lands on the control that owns it. */}
      <View style={styles.ambientRow}>
        <View style={styles.ambientTextGroup}>
          <Text style={styles.ambientLabel}>Ambient background</Text>
          <Text style={styles.ambientSubtitle}>
            Aurora + HUD grid · GPU shader layer
          </Text>
        </View>
        <SheetSwitch
          testID="appearance-ambient-toggle"
          accessibilityLabel="Ambient background"
          checked={ambientEnabled}
          onToggle={setAmbientEnabled}
        />
      </View>

      <Pressable
        testID="appearance-replay-boot"
        style={styles.outlineButton}
        onPress={replayBoot}
      >
        <Text style={styles.replayLabel}>▸ REPLAY BOOT SEQUENCE</Text>
      </Pressable>

      {/* The only real branch on this screen. The style picker is meaningless
          while ambient is off (there is nothing to preview), so it must be
          genuinely ABSENT from the tree, not merely disabled — the paired
          hidden/shown tests in AppearanceScreen.test.tsx assert both
          directions against the same container id. */}
      {ambientEnabled ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>AMBIENT STYLE</Text>
          <SegmentedPill
            segments={AMBIENT_STYLE_CELLS}
            value={ambientStyle}
            onChange={setStyle}
            variant="sheetSegment"
            frameTestID="appearance-ambient-style"
          />
        </View>
      ) : null}

      {/* The SAME `SegmentedPill` variant as the ambient picker above, so one
          style bundle dresses both. The derived invariant test in
          AppearanceScreen.test.tsx proves that variant gives every cell
          `flex: 1` (equal division of the row, safe at any width, no
          wrap/clip threshold), which covers both segments at once. */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>POWER SAVER</Text>
        <SegmentedPill
          segments={POWER_SAVER_CELLS}
          value={powerSaverLevel}
          onChange={setPowerSaverLevel}
          variant="sheetSegment"
        />
        <Text style={styles.caption}>
          {POWER_SAVER_CAPTIONS[powerSaverLevel]}
        </Text>
      </View>

      {/* Last deliberately — the only destructive action on the sheet, so it
          sits below everything reversible. */}
      <LogoutButton />
    </View>
  );
}

interface AppearanceScreenProps {
  /** Slot: fired after the boot splash is re-raised, so a host that covers the
   * screen (the Appearance overlay) can get out of its way. Optional — the
   * screen is also mounted standalone, where there is nothing to dismiss. */
  readonly onReplayBoot?: () => void;
}

/** The design names the levels rather than showing a switch, because three
 * states cannot be an on/off affordance. Uppercase to sit in the design's
 * tracked-mono segment idiom, alongside AURORA/RAYS. */
const POWER_SAVER_LABELS: Record<PowerSaverLevel, string> = {
  off: "OFF",
  calm: "CALM",
  freeze: "FREEZE",
};

/** Each level earns its own caption: "reduces motion" and "stops all motion"
 * are different promises, and Freeze's is the one worth stating plainly, since
 * a user who picks it and still sees movement has found a bug. */
const POWER_SAVER_CAPTIONS: Record<PowerSaverLevel, string> = {
  off: "All motion and ambient effects run normally.",
  calm: "Reduces motion & re-renders; ambient effects stay.",
  freeze: "Stops all motion, including the boot splash and ambient layer.",
};

const POWER_SAVER_CELLS: readonly PillSegment<PowerSaverLevel>[] =
  POWER_SAVER_LEVELS.map((level) => {
    return {
      key: level,
      label: POWER_SAVER_LABELS[level],
      testID: `appearance-power-${level}`,
    };
  });

const AMBIENT_STYLE_LABEL: Record<AmbientStyle, string> = {
  aurora: "AURORA",
  rays: "RAYS",
};

const AMBIENT_STYLE_CELLS: readonly PillSegment<AmbientStyle>[] =
  AMBIENT_STYLES.map((style) => {
    return {
      key: style,
      label: AMBIENT_STYLE_LABEL[style],
      testID: `appearance-ambient-style-${style}`,
    };
  });

/** One swatch of a theme card's preview row. The design's widths are not
 * uniform — the accent takes 16, the two directional accents 8 each — so a
 * card reads as "this skin's colour, plus its up and its down". */
interface SwatchSpec {
  readonly accentKey: "accentPrimary" | "accentPositive" | "accentNegative";
  readonly width: number;
}

const SWATCHES: readonly SwatchSpec[] = [
  { accentKey: "accentPrimary", width: 16 },
  { accentKey: "accentPositive", width: 8 },
  { accentKey: "accentNegative", width: 8 },
];

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
  headerRow: ViewStyle;
  headerTitle: TextStyle;
  skinGrid: ViewStyle;
  skinCardWrap: ViewStyle;
  skinCard: ViewStyle;
  skinCardActive: ViewStyle;
  skinSwatchRow: ViewStyle;
  skinSwatch: ViewStyle;
  skinLabel: TextStyle;
  ambientRow: ViewStyle;
  ambientTextGroup: ViewStyle;
  ambientLabel: TextStyle;
  ambientSubtitle: TextStyle;
  outlineButton: ViewStyle;
  replayLabel: TextStyle;
  section: ViewStyle;
  sectionHeading: TextStyle;
  caption: TextStyle;
}

function makeStyles(t: RnTheme): AppearanceScreenStyles {
  // The design's active card carries `box-shadow: 0 0 14px glowC`, but only
  // on the skins that HAVE a glow (`glowC` is null on classic and both
  // terminal faces). A CSS blur radius of 14 is an iOS `shadowRadius` of ~7;
  // `glowC` already carries its own alpha, so opacity stays at 1 rather than
  // multiplying it down. Offset is pinned to zero — an omitted `shadowOffset`
  // defaults to a downward drop, which would read as a card lifting off the
  // sheet rather than glowing in place.
  const glow: ViewStyle =
    t.glowC === null
      ? {}
      : {
          shadowColor: t.glowC,
          shadowOpacity: 1,
          shadowRadius: 7,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        };

  // Design: `border-radius:10px;border:1.5px solid;padding:8px 8px 7px;
  // text-align:left`.
  const skinCard: ViewStyle = {
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 7,
    borderRadius: 10,
    borderWidth: 1.5,
  };

  // Design: the sheet's two full-width outline actions share one frame —
  // `border:1px solid var(--border);border-radius:10px;padding:12px 0`.
  const outlineButton: ViewStyle = {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.borderPrimary,
  };

  return StyleSheet.create({
    // Transparent, not `bgPrimary`: the sheet behind this is a translucent
    // panel over a real blur (`AppearanceOverlay`), and an opaque scroll
    // surface here would paint straight over it. Content-sized (no flex) —
    // the host `BottomSheetScrollView` owns scrolling AND measures this
    // height for `enableDynamicSizing`, which is what kills the dead band a
    // fixed 80% snap left under SIGN OUT. Design: the sheet's own
    // `padding:10px 16px 24px`.
    panel: {
      backgroundColor: "transparent",
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 13,
    },
    // Design: `font-size:14px;font-weight:600;letter-spacing:1.5px`.
    // `flexShrink: 1` makes the title the element that gives way when the row
    // runs out of width, so the mode pill's third cell can never be pushed
    // off the edge of a narrow screen.
    headerTitle: {
      flexShrink: 1,
      fontSize: 14,
      letterSpacing: 1.5,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    // The design's grid is exact thirds at `gap: 8`. `flexWrap` + a
    // percentage width is the RN equivalent, but a FIXED gap against a
    // PERCENTAGE width means the row's no-wrap margin shrinks as the device
    // narrows — a silent 2x3 collapse with every order/count/colour/press
    // test still green. At 31% / gap 8 the no-wrap floor is a 228.6pt
    // container (260.6pt device with this file's 16pt content padding),
    // clearing a 320pt device by ~59pt. Asserted from the live rendered
    // styles by the derived invariant test in AppearanceScreen.test.tsx
    // rather than trusted from these constants.
    skinGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    skinCardWrap: { width: "31%" },
    skinCard: { ...skinCard, borderColor: t.borderPrimary },
    // Border + glow are the design's only selection cues on a card (there is
    // no check mark), and the glow is present only on glow-capable skins.
    skinCardActive: { ...skinCard, ...glow, borderColor: t.accentPrimary },
    // A SECOND, independent threshold from `skinGrid`'s: the card's own INNER
    // content width (card width minus `paddingHorizontal` and `borderWidth`
    // on both sides) against the swatch row's INTRINSIC width (16 + 8 + 8
    // plus two 3pt gaps = 38pt, all fixed). That overflow is silent too, so
    // AppearanceScreen.test.tsx derives this floor from live styles as well.
    skinSwatchRow: { flexDirection: "row", gap: 3, marginBottom: 7 },
    // `width` is per-swatch (see SWATCHES) — the design's accent swatch is
    // twice the width of the two directional ones.
    skinSwatch: { height: 16, borderRadius: 4 },
    // Design: `font-family:var(--fm);font-size:8.5px;letter-spacing:1px`.
    // Colour is per-card (the previewed skin's own accent or dim), so it is
    // applied at the call site, not here.
    skinLabel: labelStyle(t, 8.5, 1),
    // Design: `border:1px solid var(--border-sub);border-radius:10px;
    // padding:10px 13px`, then `margin-bottom:9px`.
    ambientRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.borderSubtle,
      marginBottom: 9,
    },
    // `flexShrink: 1` (not the row's default 0) lets this column give up
    // width to the switch rather than force the row wider than its container:
    // the subtitle wraps onto a second line instead of pushing the switch off
    // the edge. Wrapping text has no wrap-vs-no-wrap threshold to silently
    // cross, so this one needs no derived invariant test.
    ambientTextGroup: { flexShrink: 1 },
    ambientLabel: {
      fontSize: 11,
      letterSpacing: 0.5,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    ambientSubtitle: {
      fontSize: 9,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginTop: 2,
    },
    outlineButton,
    // Design: `font-family:var(--fm);font-size:10px;letter-spacing:2px;
    // color:var(--acc)`.
    replayLabel: {
      ...labelStyle(t, 10, 2),
      color: t.accentPrimary,
    },
    // The app-only stack below the design's own rows.
    section: { marginTop: 18 },
    // The design's section-heading idiom, taken from the rows it does spell
    // out (INSTRUMENT / DIRECTION / YOUR QUOTES):
    // `font-family:var(--fm);font-size:8.5px;letter-spacing:2px;
    // color:var(--faint)`.
    sectionHeading: {
      ...labelStyle(t, 8.5, 2),
      color: t.textMuted,
      marginBottom: 8,
    },
    caption: {
      fontSize: 8.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginTop: 6,
    },
  });
}
