import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
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
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const styles = useThemedStyles(makeStyles);
  const [ticketVisible, setTicketVisible] = useState(false);

  let body: JSX.Element;

  if (price === null) {
    body = (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    body = (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <View style={styles.row}>
          <Text style={styles.rate}>{ask.prefix}</Text>
          <Text style={movementStyle(styles, price.movementType)}>
            {ask.pips}
          </Text>
          <Text style={styles.rate}>{ask.fractional}</Text>
        </View>
        <Text style={styles.spread}>{price.spread}</Text>
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

/** Narrow style for the movement-coloured pips text — `color` stays a plain
 * `string` (not RN's optional `ColorValue`) so `movementStyle` can return it
 * directly. */
interface MovementTextStyle {
  color: string;
  fontFamily: string | undefined;
}

function movementStyle(
  styles: ReturnType<typeof makeStyles>,
  movementType: PriceMovementType,
): MovementTextStyle {
  if (movementType === PriceMovementType.UP) {
    return styles.up;
  }

  if (movementType === PriceMovementType.DOWN) {
    return styles.down;
  }

  return styles.none;
}

interface SpotTileStyles {
  container: ViewStyle;
  symbol: TextStyle;
  row: ViewStyle;
  rate: TextStyle;
  spread: TextStyle;
  loading: TextStyle;
  hidden: TextStyle;
  none: MovementTextStyle;
  up: MovementTextStyle;
  down: MovementTextStyle;
}

function makeStyles(t: RnTheme): SpotTileStyles {
  return StyleSheet.create({
    container: { padding: 12, backgroundColor: t.bgTile },
    symbol: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    row: { flexDirection: "row" },
    rate: { color: t.textPrimary, fontFamily: t.fontMono },
    spread: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    loading: { fontSize: 12, color: t.textMuted },
    hidden: { display: "none" },
    none: { color: t.textMuted, fontFamily: t.fontMono },
    up: { color: t.accentPositive, fontFamily: t.fontMono },
    down: { color: t.accentNegative, fontFamily: t.fontMono },
  });
}
