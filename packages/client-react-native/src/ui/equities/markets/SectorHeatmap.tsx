import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { groupBySector, heat } from "#/ui/equities/equityHeat";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Sector-grouped heat grid. Each cell mounts `useEquityQuote(symbol)` and
 * tints by change%. Ported from web `SectorHeatmap`. */
export function SectorHeatmap({
  selectedSymbol,
  onSelect,
}: SectorHeatmapProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  if (instruments.length === 0) {
    return (
      <Text testID="heatmap-empty" style={styles.empty}>
        NO DATA
      </Text>
    );
  }

  return (
    <View style={styles.map}>
      {groupBySector(instruments).map((group) => {
        return (
          <View key={group.sector} style={styles.sectorRow}>
            <Text style={styles.sectorLabel}>{group.sector.toUpperCase()}</Text>
            <View style={styles.cellGrid}>
              {group.instruments.map((inst) => {
                return (
                  <HeatCell
                    key={inst.symbol}
                    symbol={inst.symbol}
                    active={inst.symbol === selectedSymbol}
                    onSelect={onSelect}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface SectorHeatmapProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface HeatCellProps {
  symbol: string;
  active: boolean;
  onSelect: (symbol: string) => void;
}

function HeatCell({ symbol, active, onSelect }: HeatCellProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;
  const intensity = heat(changePct);

  return (
    <Pressable
      testID={`heatmap-cell-${symbol}`}
      style={active ? styles.cellActive : styles.cell}
      onPress={() => {
        onSelect(symbol);
      }}
    >
      <View
        pointerEvents="none"
        style={[
          styles.heat,
          {
            backgroundColor: up ? theme.accentPositive : theme.accentNegative,
            opacity: intensity * 0.5,
          },
        ]}
      />
      <Text style={styles.cellLabel}>{symbol}</Text>
    </Pressable>
  );
}

interface SectorHeatmapStyles {
  map: ViewStyle;
  sectorRow: ViewStyle;
  sectorLabel: TextStyle;
  cellGrid: ViewStyle;
  cell: ViewStyle;
  cellActive: ViewStyle;
  heat: ViewStyle;
  cellLabel: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): SectorHeatmapStyles {
  const baseCell: ViewStyle = {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
    overflow: "hidden",
    alignItems: "center",
  };
  return StyleSheet.create({
    map: { padding: 12, gap: 10 },
    sectorRow: { gap: 6 },
    sectorLabel: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    cellGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    cell: baseCell,
    cellActive: { ...baseCell, borderColor: t.accentPrimary, borderWidth: 1 },
    heat: StyleSheet.absoluteFillObject,
    cellLabel: {
      fontSize: 12,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
