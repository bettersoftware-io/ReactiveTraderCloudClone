import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { BLOTTER_COLUMN_FLEX } from "./blotterColumns";
import { formatPair, formatRate } from "./blotterFilter";
import { useRowInsertFlash } from "./useRowInsertFlash";

/** The Blotter's 4-column trade row: pair + direction subline, notional,
 * rate, and a status pill with a joined-or-fallback timestamp beneath it.
 * Column widths are the shared `BLOTTER_COLUMN_FLEX` ratios so the row lines
 * up under `BlotterHeader`. Wrapped in an `Animated.View` carrying the
 * row-insert flash (rise + fade + direction-tinted background wash). */
export function TradeRow({ trade, isNew, time }: TradeRowProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useShellMotionEnabled();
  const directionStyle = directionTextStyle(styles, trade.direction);
  const pillStyle = statusPillStyle(styles, trade.status);
  const { flashStyle } = useRowInsertFlash(
    isNew,
    directionStyle.color,
    motionEnabled,
  );

  return (
    <Animated.View
      style={[styles.row, flashStyle]}
      testID={`trade-row-${trade.tradeId}`}
    >
      <View style={styles.pairCol}>
        <Text style={styles.pair}>{formatPair(trade.currencyPair)}</Text>
        <Text style={directionStyle}>
          {trade.direction.toUpperCase()} · #{trade.tradeId}
        </Text>
      </View>
      <Text style={styles.notional}>
        {trade.notional.toLocaleString("en-US")}
      </Text>
      <Text style={styles.rate}>
        {formatRate(trade.spotRate, trade.currencyPair)}
      </Text>
      <View style={styles.statusCol}>
        <Text style={pillStyle}>{trade.status.toUpperCase()}</Text>
        <Text style={styles.time}>{time ?? trade.tradeDate}</Text>
      </View>
    </Animated.View>
  );
}

interface TradeRowProps {
  trade: Trade;
  isNew: boolean;
  time: string | undefined;
}

/** A direction subline style — `color` stays a required plain `string` (not
 * RN's optional `ColorValue`) so it can be read back by tests and fed
 * straight into `useRowInsertFlash`'s `flashColor`. */
interface DirectionStyle extends TextStyle {
  color: string;
}

/** The status pill's colour pair: text colour plus a border at ~45% alpha of
 * the same colour, both required plain `string`s for the same reason. */
interface PillStyle extends TextStyle {
  color: string;
  borderColor: string;
}

function directionTextStyle(
  styles: ReturnType<typeof makeStyles>,
  direction: Direction,
): DirectionStyle {
  return direction === Direction.Buy
    ? styles.directionBuy
    : styles.directionSell;
}

function statusPillStyle(
  styles: ReturnType<typeof makeStyles>,
  status: TradeStatus,
): PillStyle {
  if (status === TradeStatus.Done) {
    return styles.pillDone;
  }

  if (status === TradeStatus.Rejected) {
    return styles.pillRejected;
  }

  return styles.pillPending;
}

interface TradeRowStyles {
  row: ViewStyle;
  pairCol: ViewStyle;
  pair: TextStyle;
  directionBuy: DirectionStyle;
  directionSell: DirectionStyle;
  notional: TextStyle;
  rate: TextStyle;
  statusCol: ViewStyle;
  pillDone: PillStyle;
  pillPending: PillStyle;
  pillRejected: PillStyle;
  time: TextStyle;
}

// 0x73 ≈ 45% alpha, appended to a 6-digit `#RRGGBB` status accent token (RN
// supports 8-digit `#RRGGBBAA`) for the pill border — same technique as
// `useRowInsertFlash`'s alpha suffixes, and safe for the same reason: the
// accent tokens it is appended to are hex in every skin, never `rgba(...)`.
const STATUS_BORDER_ALPHA_HEX = "73";

function makeStyles(t: RnTheme): TradeRowStyles {
  const direction: TextStyle = {
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 1,
    fontFamily: t.fontMono,
  };

  const pill: TextStyle = {
    fontSize: 8,
    letterSpacing: 0.8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    fontFamily: t.fontMono,
  };

  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingTop: 7,
      paddingBottom: 6,
      backgroundColor: t.bgTile,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    pairCol: { flex: BLOTTER_COLUMN_FLEX.pair, minWidth: 0 },
    pair: {
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.4,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    directionBuy: { ...direction, color: t.accentPositive },
    directionSell: { ...direction, color: t.accentNegative },
    notional: {
      flex: BLOTTER_COLUMN_FLEX.notional,
      fontSize: 10.5,
      textAlign: "right",
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    rate: {
      flex: BLOTTER_COLUMN_FLEX.rate,
      fontSize: 10.5,
      textAlign: "right",
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    statusCol: { flex: BLOTTER_COLUMN_FLEX.status, alignItems: "flex-end" },
    pillDone: {
      ...pill,
      color: t.accentPositive,
      borderColor: `${t.accentPositive}${STATUS_BORDER_ALPHA_HEX}`,
    },
    pillPending: {
      ...pill,
      color: t.accentAware,
      borderColor: `${t.accentAware}${STATUS_BORDER_ALPHA_HEX}`,
    },
    pillRejected: {
      ...pill,
      color: t.accentNegative,
      borderColor: `${t.accentNegative}${STATUS_BORDER_ALPHA_HEX}`,
    },
    time: {
      fontSize: 7.5,
      marginTop: 2,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
  });
}
