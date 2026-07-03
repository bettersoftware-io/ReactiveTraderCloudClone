import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { DepthLevel } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Bid/ask depth ladder with size bars. Asks reversed (lowest at the bottom,
 * nearest the mid), 8 levels/side, bar width normalised by max size. Ported
 * from web `DepthLadder`. */
export function DepthLadder({ symbol }: DepthLadderProps): JSX.Element {
  const { useDepth } = useViewModel();
  const book = useDepth(symbol);
  const styles = useThemedStyles(makeStyles);

  if (!book) {
    return (
      <Text testID="depth-empty" style={styles.empty}>
        NO DEPTH DATA
      </Text>
    );
  }

  const allSizes = [
    ...book.bids.map((l) => {
      return l.size;
    }),
    ...book.asks.map((l) => {
      return l.size;
    }),
  ];
  const maxSize = Math.max(...allSizes, 1);
  const asks = [...book.asks].slice(0, 8).reverse();
  const bids = book.bids.slice(0, 8);
  const bestAsk = book.asks[0]?.price ?? 0;
  const bestBid = book.bids[0]?.price ?? 0;
  const spread =
    bestAsk > 0 && bestBid > 0 ? (bestAsk - bestBid).toFixed(2) : "—";

  return (
    <View testID="depth-ladder" style={styles.ladder}>
      <Text style={styles.sectionLabel}>ASKS</Text>
      {asks.map((level) => {
        return (
          <DepthRow
            key={`ask-${level.price}`}
            level={level}
            side="ask"
            depth={level.size / maxSize}
          />
        );
      })}
      <Text testID="depth-spread" style={styles.spread}>
        SPREAD {spread}
      </Text>
      <Text style={styles.sectionLabel}>BIDS</Text>
      {bids.map((level) => {
        return (
          <DepthRow
            key={`bid-${level.price}`}
            level={level}
            side="bid"
            depth={level.size / maxSize}
          />
        );
      })}
    </View>
  );
}

interface DepthLadderProps {
  symbol: string;
}

interface DepthRowProps {
  level: DepthLevel;
  side: "bid" | "ask";
  depth: number;
}

function DepthRow({ level, side, depth }: DepthRowProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = side === "ask" ? theme.accentNegative : theme.accentPositive;
  return (
    <View testID={`depth-row-${side}-${level.price}`} style={styles.row}>
      <View
        pointerEvents="none"
        style={[
          styles.bar,
          { backgroundColor: color, width: `${depth * 100}%` },
        ]}
      />
      <Text style={styles.price}>{level.price.toFixed(2)}</Text>
      <Text style={styles.size}>{level.size.toLocaleString()}</Text>
    </View>
  );
}

interface DepthLadderStyles {
  ladder: ViewStyle;
  sectionLabel: TextStyle;
  spread: TextStyle;
  row: ViewStyle;
  bar: ViewStyle;
  price: TextStyle;
  size: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): DepthLadderStyles {
  return StyleSheet.create({
    ladder: {
      backgroundColor: t.panel,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderSubtle,
      padding: 8,
      gap: 2,
    },
    sectionLabel: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    spread: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      textAlign: "center",
      paddingVertical: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 3,
      paddingHorizontal: 4,
      overflow: "hidden",
    },
    bar: { ...StyleSheet.absoluteFillObject, right: undefined, opacity: 0.18 },
    price: {
      flex: 1,
      fontSize: 12,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    size: {
      flex: 1,
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      textAlign: "right",
    },
    empty: {
      fontSize: 12,
      color: t.textMuted,
      fontFamily: t.fontMono,
      padding: 8,
    },
  });
}
