import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import type { Candle } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { formatChangePct } from "#/ui/equities/equityHeat";
import { CandleChart } from "#/ui/equities/trade/CandleChart";
import { useTickFlash } from "#/ui/rates/useTickFlash";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The Trade screen's instrument tile, as the mobile-v1 design draws it: one
 * bordered card whose header row carries the symbol with `name · exchange`
 * inline on the left and the last price + signed %chg on the right (both in
 * the change colour, the price popping on every tick via the shared
 * `useTickFlash` — mirrors Rates' `SpotTile`; no second flash
 * implementation), with the candle chart inside the same card beneath it.
 * Until 2026-08-29 this was `InstrumentHeader`, a stacked symbol / subtitle /
 * big-price block above a separately framed chart. */
export function InstrumentCard({
  symbol,
  candles,
}: InstrumentCardProps): JSX.Element {
  const { useWatchlist, useEquityQuote } = useViewModel();
  const instruments = useWatchlist();
  const quote = useEquityQuote(symbol);
  const theme = useTheme();
  const motionEnabled = useShellMotionEnabled();
  const { flashStyle } = useTickFlash(quote?.last ?? 0, motionEnabled);
  const styles = useThemedStyles(makeStyles);

  const instrument =
    instruments.find((inst) => {
      return inst.symbol === symbol;
    }) ?? null;
  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;
  const priceColor = up ? theme.accentPositive : theme.accentNegative;

  return (
    <View testID="instrument-card" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.subtitle}>
            {instrument !== null
              ? `${instrument.name} · ${instrument.exchange}`
              : "—"}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Animated.View style={flashStyle}>
            <Text style={[styles.price, { color: priceColor }]}>
              {quote !== null ? quote.last.toFixed(2) : "—"}
            </Text>
          </Animated.View>
          <Text style={[styles.change, { color: priceColor }]}>
            {quote !== null ? formatChangePct(changePct) : "—"}
          </Text>
        </View>
      </View>
      <CandleChart candles={candles} />
    </View>
  );
}

export interface InstrumentCardProps {
  symbol: string;
  candles: readonly Candle[];
}

interface InstrumentCardStyles {
  card: ViewStyle;
  headerRow: ViewStyle;
  identity: ViewStyle;
  symbol: TextStyle;
  subtitle: TextStyle;
  priceRow: ViewStyle;
  price: TextStyle;
  change: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentCardStyles {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      backgroundColor: t.bgTile,
      paddingTop: 11,
      paddingHorizontal: 13,
      paddingBottom: 9,
      marginBottom: 9,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
    },
    identity: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 6,
      flexShrink: 1,
    },
    symbol: {
      fontSize: 15,
      letterSpacing: 0.5,
      color: t.textPrimary,
      ...weightedFont(t, "display", "700"),
    },
    subtitle: {
      fontSize: 8.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
      flexShrink: 1,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 4,
    },
    price: {
      fontSize: 19,
      ...weightedFont(t, "mono", "700"),
    },
    change: {
      fontSize: 9,
      fontFamily: t.fontMono,
    },
  });
}
