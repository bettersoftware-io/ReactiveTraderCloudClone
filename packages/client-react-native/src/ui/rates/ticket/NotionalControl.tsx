import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { labelStyle } from "#/ui/theme/labelStyle";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The ticket's notional block, as the mobile-v1 prototype draws it
 * (`docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader
 * Mobile.dc.html` L496-510): a bordered `panelHead` card holding three
 * stacked rows — the `NOTIONAL · <base>` stamp with the ± steppers beside it
 * on the RIGHT, the amount on its own line beneath at 22px mono, then the
 * quick-size chips.
 *
 * The steppers sit in the header row rather than flanking the amount: the
 * value is the thing being read, so it gets the full width and a consistent
 * left edge with the chips below it, while the two 34x30 controls tuck into
 * the space the stamp leaves. */
export function NotionalControl({
  notional,
  base,
}: NotionalControlProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { numericValue, displayValue } = notional.state;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>NOTIONAL · {base}</Text>
        <View style={styles.stepperGroup}>
          <Pressable
            testID="notional-down"
            style={styles.stepper}
            onPress={() => {
              notional.change(
                String(Math.max(NOTIONAL_FLOOR, numericValue / 2)),
              );
            }}
          >
            <Text style={styles.stepperGlyph}>−</Text>
          </Pressable>
          <Pressable
            testID="notional-up"
            style={styles.stepper}
            onPress={() => {
              notional.change(String(numericValue * 2));
            }}
          >
            <Text style={styles.stepperGlyph}>+</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.value}>{displayValue}</Text>
      <View style={styles.chipRow}>
        {CHIPS.map((chipValue) => {
          const active = chipValue === numericValue;
          return (
            <Pressable
              key={chipValue}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.chip : "transparent",
                  borderColor: active
                    ? theme.accentPrimary
                    : theme.borderSubtle,
                },
              ]}
              onPress={() => {
                notional.change(String(chipValue));
              }}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? theme.accentPrimary : theme.textMuted },
                ]}
              >
                {chipValue / 1_000_000}M
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface NotionalControlProps {
  notional: {
    state: {
      displayValue: string;
      numericValue: number;
      error: string | null;
    };
    change: (input: string) => void;
    reset: () => void;
  };
  base: string;
}

const NOTIONAL_FLOOR = 250_000;

const CHIPS = [1, 2, 5, 10, 20].map((m) => {
  return m * 1_000_000;
});

interface NotionalControlStyles {
  card: ViewStyle;
  headRow: ViewStyle;
  label: TextStyle;
  stepperGroup: ViewStyle;
  stepper: ViewStyle;
  stepperGlyph: TextStyle;
  value: TextStyle;
  chipRow: ViewStyle;
  chip: ViewStyle;
  chipLabel: TextStyle;
}

function makeStyles(t: ReturnType<typeof useTheme>): NotionalControlStyles {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: t.borderSubtle,
      borderRadius: 11,
      backgroundColor: t.panelHead,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    label: {
      ...labelStyle(t, 9, 1.6),
      color: t.textMuted,
    },
    stepperGroup: {
      flexDirection: "row",
      gap: 6,
    },
    // Outlined on `borderPrimary` with an accent glyph and NO fill — the
    // design's own treatment; the card behind them is the fill.
    stepper: {
      width: 34,
      height: 30,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperGlyph: {
      fontSize: 13,
      color: t.accentPrimary,
      fontFamily: t.fontMono,
    },
    // `margin: 2px 0 8px` in the design, and left-aligned: it shares the
    // card's left edge with the stamp above and the chips below.
    value: {
      fontSize: 22,
      color: t.textPrimary,
      ...weightedFont(t, "mono", "600"),
      marginTop: 2,
      marginBottom: 8,
    },
    chipRow: {
      flexDirection: "row",
      gap: 6,
    },
    chip: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      alignItems: "center",
    },
    chipLabel: {
      fontSize: 10,
      ...weightedFont(t, "mono", "600"),
    },
  });
}
