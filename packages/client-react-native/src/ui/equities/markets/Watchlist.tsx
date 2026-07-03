import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { EquityInstrument } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { heat } from "#/ui/equities/equityHeat";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Scrollable instrument list. Each row mounts its own `useEquityQuote(symbol)`
 * (hooks at component top level), tinted by a heat overlay proportional to the
 * change%. Ported from web `Watchlist`. */
export function Watchlist({
  selectedSymbol,
  onSelect,
}: WatchlistProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  if (instruments.length === 0) {
    return (
      <Text testID="watchlist-empty" style={styles.empty}>
        NO INSTRUMENTS
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      <View style={styles.header}>
        <Text style={styles.hSymbol}>SYMBOL</Text>
        <Text style={styles.hNum}>LAST</Text>
        <Text style={styles.hNum}>CHG%</Text>
        <Text style={styles.hNum}>SPRD</Text>
      </View>
      {instruments.map((inst) => {
        return (
          <WatchlistRow
            key={inst.symbol}
            instrument={inst}
            active={inst.symbol === selectedSymbol}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}

interface WatchlistProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface WatchlistRowProps {
  instrument: EquityInstrument;
  active: boolean;
  onSelect: (symbol: string) => void;
}

function WatchlistRow({
  instrument,
  active,
  onSelect,
}: WatchlistRowProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(instrument.symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;
  const intensity = heat(changePct);
  const last = quote ? quote.last.toFixed(2) : "—";
  const change = quote ? `${up ? "+" : ""}${changePct.toFixed(2)}%` : "—";
  const spread = quote ? (quote.ask - quote.bid).toFixed(2) : "—";

  return (
    <Pressable
      testID={`watchlist-row-${instrument.symbol}`}
      style={active ? styles.rowActive : styles.row}
      onPress={() => {
        onSelect(instrument.symbol);
      }}
    >
      <View
        pointerEvents="none"
        style={[
          styles.heat,
          {
            backgroundColor: up ? theme.accentPositive : theme.accentNegative,
            opacity: intensity * 0.4,
          },
        ]}
      />
      <Text style={styles.symbol}>{instrument.symbol}</Text>
      <Text style={styles.num}>{last}</Text>
      <Text style={[styles.num, up ? styles.up : styles.down]}>{change}</Text>
      <Text style={styles.num}>{spread}</Text>
    </Pressable>
  );
}

interface WatchlistStyles {
  list: ViewStyle;
  header: ViewStyle;
  hSymbol: TextStyle;
  hNum: TextStyle;
  row: ViewStyle;
  rowActive: ViewStyle;
  heat: ViewStyle;
  symbol: TextStyle;
  num: TextStyle;
  up: TextStyle;
  down: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): WatchlistStyles {
  const baseRow: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.borderSubtle,
  };
  const headerCell: TextStyle = {
    fontSize: 10,
    color: t.textMuted,
    fontFamily: t.fontMono,
  };
  return StyleSheet.create({
    list: { backgroundColor: t.panel },
    header: { ...baseRow, paddingVertical: 6 },
    hSymbol: { ...headerCell, flex: 2 },
    hNum: { ...headerCell, flex: 1, textAlign: "right" },
    row: baseRow,
    rowActive: { ...baseRow, backgroundColor: t.chip },
    heat: StyleSheet.absoluteFillObject,
    symbol: {
      flex: 2,
      fontSize: 13,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    num: {
      flex: 1,
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      textAlign: "right",
    },
    up: { color: t.accentPositive },
    down: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
