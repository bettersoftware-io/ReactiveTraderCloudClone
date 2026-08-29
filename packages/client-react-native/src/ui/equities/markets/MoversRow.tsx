import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Candle } from "@rtc/domain";

import { formatChangePct } from "#/ui/equities/equityHeat";
import type { MoverRow } from "#/ui/equities/markets/moversVm";
import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** One ranked row of the movers board: a zero-padded rank index, the symbol
 * over the company name, an inline close-price sparkline, the last price,
 * and a tinted signed-percentage pill. Ported from the design's mover row
 * (dc.html ~L339): rank | symbol + name | sparkline | price + pct pill.
 * `MoverRow` itself carries no close series — `candles` arrives as a prop
 * (read off the ViewModel seam one level up, by `MoversBoard`'s
 * `MoversBoardRow`, which already bails on the seam for `useEquityQuote`) and
 * is handed straight to `RowSparkline`, there being no equities tick-history
 * stream to pull one from. The board (a later task) supplies `rank` and owns
 * sort order; this component only renders one row of it.
 *
 * `last`/`changePct` arrive together and are both null until the first quote
 * for that symbol lands (see `moversVm`'s `MoverRow` doc) — so before that,
 * the price shows a `—` placeholder and the pct pill is omitted rather than
 * showing a meaningless "no change yet" percentage. */
export function MoversRow({
  row,
  rank,
  selected,
  onSelect,
  candles,
}: MoversRowProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      testID={`eq-mover-${row.symbol}`}
      style={selected ? styles.rowSelected : styles.row}
      onPress={() => {
        onSelect(row.symbol);
      }}
    >
      <Text testID={`eq-mover-${row.symbol}-rank`} style={styles.rank}>
        {String(rank).padStart(2, "0")}
      </Text>
      <View style={styles.identity}>
        <Text style={styles.symbol}>{row.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
        </Text>
      </View>
      <RowSparkline
        symbol={row.symbol}
        positive={(row.changePct ?? 0) >= 0}
        candles={candles}
      />
      <View style={styles.priceCol}>
        <Text style={styles.price}>
          {row.last === null ? "—" : row.last.toFixed(2)}
        </Text>
        {row.changePct === null ? null : (
          <Text style={pctPillStyle(styles, row.changePct)}>
            {formatChangePct(row.changePct)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

interface MoversRowProps {
  row: MoverRow;
  rank: number;
  selected: boolean;
  onSelect: (symbol: string) => void;
  candles: readonly Candle[];
}

/** The pct pill's colour pair — `color`/`backgroundColor` stay required plain
 * `string`s (not RN's optional `ColorValue`) for the same reason as
 * `TradeRow`'s `PillStyle`: both come straight from theme tokens, never a
 * hardcoded hex. */
interface PillStyle extends TextStyle {
  color: string;
  backgroundColor: string;
}

function pctPillStyle(styles: MoversRowStyles, changePct: number): PillStyle {
  return changePct >= 0 ? styles.pillPositive : styles.pillNegative;
}

interface MoversRowStyles {
  row: ViewStyle;
  rowSelected: ViewStyle;
  rank: TextStyle;
  identity: ViewStyle;
  symbol: TextStyle;
  name: TextStyle;
  priceCol: ViewStyle;
  price: TextStyle;
  pillPositive: PillStyle;
  pillNegative: PillStyle;
}

// ~13% alpha, matching the design's pill background
// (`color-mix(in oklab, {{ m.c }} 13%, transparent)`, dc.html ~L339) —
// same technique as `TradeRow`'s `STATUS_BORDER_ALPHA_HEX`: RN accepts
// 8-digit `#RRGGBBAA`, and every accent token here is 6-digit hex.
const PCT_PILL_ALPHA_HEX = "21";

function makeStyles(t: RnTheme): MoversRowStyles {
  const baseRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    backgroundColor: t.bgTile,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  };

  const pillBase: TextStyle = {
    fontSize: 8.5,
    fontFamily: t.fontMono,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
    alignSelf: "flex-end",
  };

  return StyleSheet.create({
    row: baseRow,
    // The selected ring — the design's `style-active="border-color:
    // var(--border-strong)"` (dc.html:340): the same 1px rule, stepped up to
    // `borderStrong` rather than the accent.
    rowSelected: { ...baseRow, borderColor: t.borderStrong },
    rank: {
      width: 20,
      fontSize: 9,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    identity: { flex: 1, minWidth: 0 },
    symbol: {
      fontSize: 12,
      letterSpacing: 0.4,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    name: {
      fontSize: 8,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginTop: 1,
    },
    // `minHeight` reserves room for the pct pill line even when it's absent
    // (no quote yet, or `changePct === null`) — otherwise an unpriced row is
    // shorter than a priced one, which reads as a layout jump in a list built
    // for scanning.
    priceCol: { alignItems: "flex-end", minHeight: 30 },
    price: {
      fontSize: 11.5,
      color: t.textPrimary,
      ...weightedFont(t, "mono", "600"),
    },
    pillPositive: {
      ...pillBase,
      color: t.accentPositive,
      backgroundColor: `${t.accentPositive}${PCT_PILL_ALPHA_HEX}`,
    },
    pillNegative: {
      ...pillBase,
      color: t.accentNegative,
      backgroundColor: `${t.accentNegative}${PCT_PILL_ALPHA_HEX}`,
    },
  });
}
