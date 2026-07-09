import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { PriceMovementType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import { TradeTicket } from "#/ui/TradeTicket";
import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

const ARROW: Record<PriceMovementType, string> = {
  [PriceMovementType.UP]: "▲",
  [PriceMovementType.DOWN]: "▼",
  [PriceMovementType.NONE]: "▬",
};

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const styles = useThemedStyles(makeStyles);
  const [ticketVisible, setTicketVisible] = useState(false);

  const label = `${pair.base} / ${pair.terms}`;

  let body: JSX.Element;

  if (price === null) {
    body = (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.symbol}>{label}</Text>
        </View>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    body = (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.symbol}>{label}</Text>
          <Text style={arrowStyle(styles, price.movementType)}>
            {ARROW[price.movementType]}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.priceRow}>
          <Text style={styles.big}>{ask.prefix}</Text>
          <Text style={pipsStyle(styles, price.movementType)}>{ask.pips}</Text>
          <Text style={styles.big}>{ask.fractional}</Text>
        </View>
        <View style={styles.footerRow}>
          <View style={styles.sideGroup}>
            <Text style={styles.sideLabel}>BID</Text>
            <Text style={styles.side}>
              {price.bid.toFixed(pair.ratePrecision)}
            </Text>
          </View>
          <Text style={styles.spread}>{price.spread}</Text>
          <View style={styles.sideGroup}>
            <Text style={styles.sideLabel}>ASK</Text>
            <Text style={styles.side}>
              {price.ask.toFixed(pair.ratePrecision)}
            </Text>
          </View>
        </View>
        <Text style={styles.hidden} testID="spot-tile-movement">
          {price.movementType}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="spot-tile"
        style={({ pressed }: PressableStateCallbackType): ViewStyle => {
          return pressed ? styles.pressed : styles.rest;
        }}
        onPress={() => {
          setTicketVisible(true);
        }}
      >
        {body}
      </Pressable>
      {ticketVisible ? (
        <TradeTicket
          pair={pair}
          onClose={() => {
            setTicketVisible(false);
          }}
        />
      ) : null}
    </>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

/** Narrow style for the movement-coloured text — `color` stays a plain
 * `string` so it can be read directly in tests via `.props.style.color`. */
interface MovementTextStyle {
  color: string;
  fontFamily: string | undefined;
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
}

function pipsStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.pipsUp;
  if (movement === PriceMovementType.DOWN) return styles.pipsDown;
  return styles.pipsNone;
}

function arrowStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.arrowUp;
  if (movement === PriceMovementType.DOWN) return styles.arrowDown;
  return styles.arrowNone;
}

interface SpotTileStyles {
  rest: ViewStyle;
  pressed: ViewStyle;
  card: ViewStyle;
  headerRow: ViewStyle;
  symbol: TextStyle;
  divider: ViewStyle;
  priceRow: ViewStyle;
  big: TextStyle;
  footerRow: ViewStyle;
  sideGroup: ViewStyle;
  sideLabel: TextStyle;
  side: TextStyle;
  spread: TextStyle;
  loading: TextStyle;
  hidden: TextStyle;
  pipsUp: MovementTextStyle;
  pipsDown: MovementTextStyle;
  pipsNone: MovementTextStyle;
  arrowUp: MovementTextStyle;
  arrowDown: MovementTextStyle;
  arrowNone: MovementTextStyle;
}

function makeStyles(t: RnTheme): SpotTileStyles {
  const pipsBase = { fontSize: 22, fontFamily: t.fontMono } as const;
  const arrowBase = { fontSize: 13, fontFamily: t.fontDisplay } as const;
  // Pressed lift: on skins with a glow, swap the shadow colour to the glow and
  // raise it; flat skins (no glow) fall back to a subtle opacity dim.
  const pressed: ViewStyle = t.depth.glow
    ? {
        ...depthStyle(t.depth),
        shadowColor: t.depth.glow,
        shadowOpacity: 0.9,
        shadowRadius: 18,
      }
    : { opacity: 0.9 };
  return StyleSheet.create({
    rest: {},
    pressed,
    card: {
      flex: 1,
      marginVertical: 6,
      padding: 14,
      borderRadius: 12,
      backgroundColor: t.bgTile,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderPrimary,
      // Physical elevation for 3d skins; {} for flat.
      ...depthStyle(t.depth),
      // 1px inset-highlight approximation on the top edge (3d skins only).
      borderTopWidth: t.depth.topHighlight ? 1 : StyleSheet.hairlineWidth,
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    symbol: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      letterSpacing: 0.5,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.borderSubtle,
      marginVertical: 10,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end" },
    big: { fontSize: 18, color: t.textSecondary, fontFamily: t.fontMono },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    sideGroup: { flexDirection: "row", alignItems: "center" },
    sideLabel: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginRight: 4,
    },
    side: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    spread: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
      backgroundColor: t.chip,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    loading: { fontSize: 12, color: t.textMuted, marginTop: 10 },
    hidden: { display: "none" },
    pipsUp: { ...pipsBase, color: t.accentPositive },
    pipsDown: { ...pipsBase, color: t.accentNegative },
    pipsNone: { ...pipsBase, color: t.textPrimary },
    arrowUp: { ...arrowBase, color: t.accentPositive },
    arrowDown: { ...arrowBase, color: t.accentNegative },
    arrowNone: { ...arrowBase, color: t.textMuted },
  });
}
