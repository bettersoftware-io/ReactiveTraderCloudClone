import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { formatChangePct } from "#/ui/equities/equityHeat";
import { useTickFlash } from "#/ui/rates/useTickFlash";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Trade screen's instrument header: symbol, `name · exchange`, and the big
 * last price tinted by the signed %chg — pops (scale) on every quote tick
 * via the shared `useTickFlash` (mirrors Rates' `SpotTile`; no second flash
 * implementation). */
export function InstrumentHeader({
  symbol,
}: InstrumentHeaderProps): JSX.Element {
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
    <View style={styles.container}>
      <Text style={styles.symbol}>{symbol}</Text>
      <Text style={styles.subtitle}>
        {instrument !== null
          ? `${instrument.name} · ${instrument.exchange}`
          : "—"}
      </Text>
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
  );
}

export interface InstrumentHeaderProps {
  symbol: string;
}

interface InstrumentHeaderStyles {
  container: ViewStyle;
  symbol: TextStyle;
  subtitle: TextStyle;
  priceRow: ViewStyle;
  price: TextStyle;
  change: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentHeaderStyles {
  return StyleSheet.create({
    container: { gap: 2 },
    symbol: {
      fontSize: 20,
      fontWeight: "700",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 10,
      marginTop: 4,
    },
    price: {
      fontSize: 30,
      fontWeight: "700",
      fontFamily: t.fontDisplay,
    },
    change: {
      fontSize: 14,
      fontFamily: t.fontMono,
    },
  });
}
