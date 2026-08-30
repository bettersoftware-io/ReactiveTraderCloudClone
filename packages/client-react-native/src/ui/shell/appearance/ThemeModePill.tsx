import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { THEME_MODE_PREFERENCES, type ThemeModePreference } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The appearance sheet's header pill: the design's inline dark/light selector
 * (`Reactive Trader Mobile.dc.html`, appearance-sheet block — a `1px --border`
 * frame at radius 8 holding 9px-mono cells tracked 1.5, the active one filled
 * with the accent and lettered `--onAcc`), plus a third `AUTO` cell for the
 * app's `system` preference, which the design has no equivalent of.
 *
 * Cells are intrinsically sized, not `flex: 1` — the pill shares the header
 * row with the APPEARANCE title, so it must take only the width its labels
 * need. The title is the element that gives way (`headerTitle` carries
 * `flexShrink: 1` in `AppearanceScreen`), which is what keeps the third cell
 * from ever being pushed off a narrow screen.
 *
 * Presentational: it reports the cell that was pressed and holds no
 * preference state — `AppearanceScreen` owns the cycle arithmetic the
 * ViewModel's setter-less `useThemePreference()` seam requires. */
export function ThemeModePill({
  value,
  onSelect,
}: ThemeModePillProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View testID="appearance-mode-pill" style={styles.pill}>
      {THEME_MODE_PREFERENCES.map((target) => {
        const active = value === target;

        return (
          <Pressable
            key={target}
            testID={`appearance-mode-${target}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={active ? styles.cellActive : styles.cell}
            onPress={() => {
              onSelect(target);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {MODE_LABEL[target]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ThemeModePillProps {
  readonly value: ThemeModePreference;
  /** Slot: fired with the cell that was pressed, active or not. */
  readonly onSelect: (target: ThemeModePreference) => void;
}

/** Verbatim from the design, glyphs included — a bare `\uXXXX` escape renders
 * as the literal escape sequence in this codebase's JSX, so these are real
 * glyphs. `AUTO` is this app's own third cell (the design stops at two) and
 * takes no glyph: the design's pair are a moon and a sun, and there is no
 * third mark in that family that reads as "follow the system". */
const MODE_LABEL: Record<ThemeModePreference, string> = {
  dark: "☾ DARK",
  light: "☀ LIGHT",
  system: "AUTO",
};

interface ThemeModePillStyles {
  pill: ViewStyle;
  cell: ViewStyle;
  cellActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): ThemeModePillStyles {
  // The design's cells are `padding: 8px 14px`. 11 here, not 14: the third
  // AUTO cell is ~56pt of width the design never budgeted for, and at 14 the
  // title + pill overflow a 320pt device's content row. Trimming the
  // horizontal padding is the smallest change that keeps all three cells and
  // the design's type, and it is the only value on this control that deviates.
  const cell: ViewStyle = {
    paddingVertical: 8,
    paddingHorizontal: 11,
  };

  const label: TextStyle = {
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: t.fontMono,
  };

  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 8,
      overflow: "hidden",
    },
    cell,
    cellActive: { ...cell, backgroundColor: t.accentPrimary },
    label: { ...label, color: t.textSecondary },
    labelActive: { ...label, color: t.textOnAccent },
  });
}
