import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import type { CurrencyPair } from "@rtc/domain";
import { PriceMovementType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import { useTickFlash } from "#/ui/rates/useTickFlash";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { TileSheen } from "#/ui/TileSheen";
import { depthStyle } from "#/ui/theme/depthStyle";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

export function SpotTile({ pair, onOpenTicket }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const theme = useTheme();
  const motionEnabled = useShellMotionEnabled();
  const { flashStyle } = useTickFlash(
    price === null ? 0 : price.mid,
    motionEnabled,
  );
  const styles = useThemedStyles(makeStyles);
  const label = `${pair.base}/${pair.terms}`;

  let body: JSX.Element;

  if (price === null) {
    body = <Text style={styles.loading}>Loading…</Text>;
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    const movementColor = colorForMovement(theme, price.movementType);
    body = (
      <>
        <View style={styles.headerRow}>
          <Text style={styles.symbol}>{label}</Text>
          <Text style={[styles.arrow, { color: movementColor }]}>
            {ARROW[price.movementType]}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.priceRow}>
          <Text style={styles.prefix}>{ask.prefix}</Text>
          <Animated.View style={flashStyle}>
            <Text
              testID={`spot-tile-pips-${pair.symbol}`}
              style={[styles.pips, { color: movementColor }]}
            >
              {ask.pips}
            </Text>
          </Animated.View>
          <Text style={styles.fractional}>{ask.fractional}</Text>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.side}>
            B {price.bid.toFixed(pair.ratePrecision)}
          </Text>
          <Text style={styles.spread}>{price.spread}</Text>
          <Text style={styles.side}>
            A {price.ask.toFixed(pair.ratePrecision)}
          </Text>
        </View>
      </>
    );
  }

  return (
    <Pressable
      testID={`spot-tile-${pair.symbol}`}
      style={styles.tile}
      onPress={() => {
        onOpenTicket(pair);
      }}
    >
      <TileSheen />
      {body}
    </Pressable>
  );
}

export interface SpotTileProps {
  pair: CurrencyPair;
  onOpenTicket: (pair: CurrencyPair) => void;
}

const ARROW: Record<PriceMovementType, string> = {
  [PriceMovementType.UP]: "▲",
  [PriceMovementType.DOWN]: "▼",
  [PriceMovementType.NONE]: "▬",
};

function colorForMovement(
  theme: ReturnType<typeof useTheme>,
  movement: PriceMovementType,
): string {
  if (movement === PriceMovementType.UP) {
    return theme.accentPositive;
  }

  if (movement === PriceMovementType.DOWN) {
    return theme.accentNegative;
  }

  return theme.textSecondary;
}

interface SpotTileStyles {
  tile: ViewStyle;
  headerRow: ViewStyle;
  symbol: TextStyle;
  arrow: TextStyle;
  divider: ViewStyle;
  priceRow: ViewStyle;
  prefix: TextStyle;
  pips: TextStyle;
  fractional: TextStyle;
  footerRow: ViewStyle;
  side: TextStyle;
  spread: TextStyle;
  loading: TextStyle;
}

function makeStyles(t: ReturnType<typeof useTheme>): SpotTileStyles {
  return StyleSheet.create({
    // The design's price tile is a full `--tile-bg` / `--tile-shadow` surface
    // (dc.html:108) — on 3d skins TileSheen paints the gradient and depthStyle
    // the drop shadow + inset top highlight; flat skins keep the tonal bgTile.
    tile: {
      paddingHorizontal: 14,
      paddingTop: 13,
      paddingBottom: 11,
      backgroundColor: t.bgTile,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      ...depthStyle(t.depth),
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    symbol: {
      fontSize: 13,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
      letterSpacing: 0.5,
    },
    arrow: { fontSize: 12, fontFamily: t.fontDisplay },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.borderSubtle,
      marginVertical: 8,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end" },
    prefix: { fontSize: 14, color: t.textSecondary, fontFamily: t.fontMono },
    pips: { fontSize: 25, ...weightedFont(t, "mono", "600") },
    fractional: {
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    side: { fontSize: 9, color: t.textMuted, fontFamily: t.fontMono },
    spread: {
      fontSize: 9,
      color: t.textMuted,
      fontFamily: t.fontMono,
      backgroundColor: t.chip,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    loading: { fontSize: 12, color: t.textMuted, marginTop: 10 },
  });
}
