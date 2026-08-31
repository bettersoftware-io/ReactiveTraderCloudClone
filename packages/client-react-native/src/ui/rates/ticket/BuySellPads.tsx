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
import { labelStyle } from "#/ui/theme/labelStyle";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

export function BuySellPads({
  pair,
  price,
  onExecute,
}: BuySellPadsProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Pad
        testID="sell-pad"
        label="SELL"
        value={splitPrice(price.bid, pair.ratePrecision, pair.pipsPosition)}
        accent={theme.accentNegative}
        align="start"
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
        align="end"
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
  align,
  theme,
  onPress,
}: PadProps): JSX.Element {
  const styles = makePadStyles(theme, accent, align);

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
  align: "start" | "end";
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
      gap: 9,
    },
    spreadPill: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: [{ translateX: -20 }, { translateY: -10 }],
      backgroundColor: t.bgHeader,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      // A true pill, as the design draws it (`border-radius:999px`) — at this
      // height the old 10 read as a rounded rectangle between the two pads.
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    spreadText: {
      fontSize: 9,
      fontFamily: t.fontMono,
      color: t.textSecondary,
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

// The design's execute pads (dc.html:513/521): a 13px-radius button whose
// border and fill are the side's own accent at 55% / 12% (`color-mix(in
// oklab, var(--neg|--pos) 55%|12%, transparent)`), SELL left-aligned and BUY
// right-aligned, label 9px / 2px tracking / 600, price row bottom-aligned
// 5px below (prefix 13px on a 2px baseline pad, pips 27px/700/line-height 1,
// fractional 12px). Every skin's accents are six-digit hex, so the alpha
// byte is appended directly — same local-tint precedent as `NewRfqForm`'s
// `tint12`; a repo-wide `withAlpha` still does not exist.
function makePadStyles(
  t: ReturnType<typeof useTheme>,
  accent: string,
  align: "start" | "end",
): PadStyles {
  const base: ViewStyle = {
    flex: 1,
    alignItems: align === "start" ? "flex-start" : "flex-end",
    paddingTop: 11,
    paddingHorizontal: 13,
    paddingBottom: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: `${accent}8C`,
    backgroundColor: `${accent}1F`,
  };

  // dc.html:513 `style-active` — a press glows the pad in its own accent
  // (`box-shadow:0 0 18px` at 55%), not the skin's ambient glow colour;
  // `glowC === null` still gates the glow-less skins to a flat dim.
  const glow: ViewStyle | null =
    t.glowC === null
      ? null
      : {
          shadowColor: accent,
          shadowOpacity: 0.55,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        };

  return StyleSheet.create({
    padRest: base,
    padPressed:
      glow === null ? { ...base, opacity: 0.85 } : { ...base, ...glow },
    label: {
      ...labelStyle(t, 9, 2, "600"),
      color: accent,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 5 },
    prefix: {
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      paddingBottom: 2,
    },
    pips: {
      fontSize: 27,
      lineHeight: 27,
      color: accent,
      ...weightedFont(t, "mono", "700"),
    },
    fractional: {
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
