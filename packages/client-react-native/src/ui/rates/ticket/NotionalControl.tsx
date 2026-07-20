import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useTheme } from "#/ui/theme/useTheme";

export function NotionalControl({
  notional,
  base,
}: NotionalControlProps): JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { numericValue, displayValue } = notional.state;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>NOTIONAL · {base}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          testID="notional-down"
          style={styles.stepper}
          onPress={() => {
            notional.change(String(Math.max(NOTIONAL_FLOOR, numericValue / 2)));
          }}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Text style={styles.value}>{displayValue}</Text>
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
      <View style={styles.chipRow}>
        {CHIPS.map((chipValue) => {
          const active = chipValue === numericValue;
          return (
            <Pressable
              key={chipValue}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.accentPrimary : theme.chip,
                  borderColor: active ? theme.accentPrimary : theme.border,
                },
              ]}
              onPress={() => {
                notional.change(String(chipValue));
              }}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? theme.textOnAccent : theme.textSecondary },
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
  container: ViewStyle;
  label: TextStyle;
  stepperRow: ViewStyle;
  stepper: ViewStyle;
  stepperGlyph: TextStyle;
  value: TextStyle;
  chipRow: ViewStyle;
  chip: ViewStyle;
  chipLabel: TextStyle;
}

function makeStyles(t: ReturnType<typeof useTheme>): NotionalControlStyles {
  return StyleSheet.create({
    container: { gap: 8 },
    label: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    },
    stepper: {
      width: 34,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.chip,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperGlyph: {
      fontSize: 16,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    value: {
      fontSize: 22,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontMono,
      minWidth: 120,
      textAlign: "center",
    },
    chipRow: {
      flexDirection: "row",
      justifyContent: "space-between",
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
      fontWeight: "600",
      fontFamily: t.fontMono,
    },
  });
}
