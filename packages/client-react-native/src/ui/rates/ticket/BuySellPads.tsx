import type { JSX } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction } from "@rtc/domain";

import { splitPrice } from "#/ui/formatPrice";
import { useTheme } from "#/ui/theme/useTheme";

export function BuySellPads({
  pair,
  price,
  onExecute,
}: BuySellPadsProps): JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <Pad
        testID="sell-pad"
        label="SELL"
        value={splitPrice(price.bid, pair.ratePrecision, pair.pipsPosition)}
        accent={theme.accentNegative}
        theme={theme}
        onPress={() => {
          onExecute(Direction.Sell);
        }}
      />
      <Pad
        testID="buy-pad"
        label="BUY"
        value={splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition)}
        accent={theme.accentPositive}
        theme={theme}
        onPress={() => {
          onExecute(Direction.Buy);
        }}
      />
      <View style={styles.spreadPill} pointerEvents="none">
        <Text style={styles.spreadText}>{price.spread}</Text>
      </View>
    </View>
  );
}

export interface BuySellPadsProps {
  pair: CurrencyPair;
  price: Price;
  onExecute: (direction: Direction) => void;
}

// Private: one execute pad (SELL or BUY). Not exported — rtc/component-newspaper
// permits private subcomponents below the lede.
function Pad({
  testID,
  label,
  value,
  accent,
  theme,
  onPress,
}: PadProps): JSX.Element {
  const styles = makePadStyles(theme, accent);

  return (
    <Pressable
      testID={testID}
      style={(state: PressableStateCallbackType): ViewStyle => {
        return state.pressed ? styles.padPressed : styles.padRest;
      }}
      onPress={onPress}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.prefix}>{value.prefix}</Text>
        <Text style={styles.pips}>{value.pips}</Text>
        <Text style={styles.fractional}>{value.fractional}</Text>
      </View>
    </Pressable>
  );
}

interface PadProps {
  testID: string;
  label: string;
  value: { prefix: string; pips: string; fractional: string };
  accent: string;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}

interface BuySellPadsStyles {
  container: ViewStyle;
  spreadPill: ViewStyle;
  spreadText: TextStyle;
}

function makeStyles(t: ReturnType<typeof useTheme>): BuySellPadsStyles {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      gap: 8,
    },
    spreadPill: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: [{ translateX: -20 }, { translateY: -10 }],
      backgroundColor: t.bgHeader,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    spreadText: {
      fontSize: 9,
      fontFamily: t.fontMono,
      color: t.textMuted,
    },
  });
}

interface PadStyles {
  padRest: ViewStyle;
  padPressed: ViewStyle;
  label: TextStyle;
  priceRow: ViewStyle;
  prefix: TextStyle;
  pips: TextStyle;
  fractional: TextStyle;
}

function makePadStyles(
  t: ReturnType<typeof useTheme>,
  accent: string,
): PadStyles {
  const base: ViewStyle = {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.chip,
  };

  const glow: ViewStyle | null =
    t.glowC === null
      ? null
      : {
          shadowColor: t.glowC,
          shadowOpacity: 0.9,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        };

  return StyleSheet.create({
    padRest: base,
    padPressed:
      glow === null ? { ...base, opacity: 0.85 } : { ...base, ...glow },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: accent,
      fontFamily: t.fontMono,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end" },
    prefix: { fontSize: 12, color: t.textSecondary, fontFamily: t.fontMono },
    pips: {
      fontSize: 27,
      fontWeight: "700",
      color: accent,
      fontFamily: t.fontMono,
    },
    fractional: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
