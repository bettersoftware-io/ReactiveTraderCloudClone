import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import { GLIDE_DUR_MS } from "@rtc/motion-core";
import { useViewModel } from "@rtc/react-bindings";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { type MoverRow, sortMovers } from "#/ui/equities/markets/moversVm";
import { useRankMoveGlide } from "#/ui/equities/markets/useRankMoveGlide";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Movers board: `useWatchlist()`'s instruments ranked by the shared
 * `useEqWatchlistSort()` preference, one `MoversRow` per instrument. The app
 * has no bulk-quotes hook, so each row owns its own `useEquityQuote(symbol)`
 * subscription (`MoversBoardRow` below) and reports ticks up via `onQuote` —
 * mirrors web's `WatchlistPanel`/`WatchlistRow` split — so this board can
 * rank by %chg/price without duplicating quote streams or calling
 * `useEquityQuote` in a loop. Rows key on `symbol`, never index: that is
 * what lets a re-sort glide the SAME row element to its new slot (via each
 * row's `Animated.View` `layout={LinearTransition...}`) instead of
 * remounting it — an index key would silently degrade the glide into a
 * cross-fade. Supersedes `Watchlist`. */
export function MoversBoard({
  selectedSymbol,
  onSelect,
}: MoversBoardProps): JSX.Element {
  const { useWatchlist, useEqWatchlistSort } = useViewModel();
  const instruments = useWatchlist();
  const { sort } = useEqWatchlistSort();
  const motionEnabled = useShellMotionEnabled();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});

  function recordQuote(symbol: string, last: number, changePct: number): void {
    setQuotes((prev) => {
      const existing = prev[symbol];

      if (
        existing &&
        existing.last === last &&
        existing.changePct === changePct
      ) {
        return prev;
      }

      return { ...prev, [symbol]: { last, changePct } };
    });
  }

  if (instruments.length === 0) {
    return (
      <Text testID="eq-movers-empty" style={styles.empty}>
        NO MOVERS
      </Text>
    );
  }

  const rows: readonly MoverRow[] = instruments.map((inst) => {
    const q = quotes[inst.symbol];
    return {
      symbol: inst.symbol,
      name: inst.name,
      last: q?.last ?? null,
      changePct: q?.changePct ?? null,
    };
  });
  const ranked = sortMovers(rows, sort);

  return (
    <View testID="eq-movers-board" style={styles.board}>
      {ranked.map((row, index) => {
        return (
          <MoversBoardRow
            key={row.symbol}
            row={row}
            rank={index + 1}
            selected={row.symbol === selectedSymbol}
            onSelect={onSelect}
            onQuote={recordQuote}
            motionEnabled={motionEnabled}
            riseColor={theme.accentPositive}
            fallColor={theme.accentNegative}
          />
        );
      })}
    </View>
  );
}

interface MoversBoardProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface QuoteSnapshot {
  last: number;
  changePct: number;
}

interface MoversBoardRowProps {
  row: MoverRow;
  rank: number;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onQuote: (symbol: string, last: number, changePct: number) => void;
  motionEnabled: boolean;
  riseColor: string;
  fallColor: string;
}

function MoversBoardRow({
  row,
  rank,
  selected,
  onSelect,
  onQuote,
  motionEnabled,
  riseColor,
  fallColor,
}: MoversBoardRowProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(row.symbol);
  const styles = useThemedStyles(makeStyles);
  const { overlayStyle } = useRankMoveGlide(
    rank,
    riseColor,
    fallColor,
    motionEnabled,
  );

  useEffect(() => {
    if (!quote) {
      return;
    }

    onQuote(row.symbol, quote.last, quote.changePct);
  }, [quote, row.symbol, onQuote]);

  if (!motionEnabled) {
    return (
      <View style={styles.rowWrap}>
        <MoversRow
          row={row}
          rank={rank}
          selected={selected}
          onSelect={onSelect}
        />
      </View>
    );
  }

  return (
    <Animated.View
      style={styles.rowWrap}
      layout={LinearTransition.duration(GLIDE_DUR_MS)}
      entering={FadeIn.duration(GLIDE_DUR_MS)}
      exiting={FadeOut.duration(GLIDE_DUR_MS)}
    >
      <MoversRow
        row={row}
        rank={rank}
        selected={selected}
        onSelect={onSelect}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.rankGlow, overlayStyle]}
      />
    </Animated.View>
  );
}

interface MoversBoardStyles {
  board: ViewStyle;
  rowWrap: ViewStyle;
  rankGlow: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): MoversBoardStyles {
  return StyleSheet.create({
    board: { paddingHorizontal: SPACING.md },
    rowWrap: { position: "relative" },
    // `bottom: SPACING.xs` (not `StyleSheet.absoluteFill`) so the glow tint
    // covers MoversRow's own rounded box without bleeding into the
    // `marginBottom: SPACING.xs` gap MoversRow leaves for the next row.
    rankGlow: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: SPACING.xs,
      borderRadius: 10,
    },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
