import type { JSX } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import {
  BLOTTER_FILTERS,
  type BlotterFilter,
  type BlotterSummary,
} from "./blotterFilter";

/** The Blotter's top bar: status chips (ALL/DONE/PENDING/REJECTED) on the
 * left, a right-aligned fills summary on the right. */
export function BlotterFilterBar({
  selected,
  onSelect,
  summary,
}: BlotterFilterBarProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row} testID="blotter-filter-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.chips}
        testID="blotter-filter-chips"
      >
        {BLOTTER_FILTERS.map((filter) => {
          const active = filter === selected;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onSelect(filter);
              }}
              style={active ? styles.pillActive : styles.pill}
            >
              <Text style={active ? styles.labelActive : styles.label}>
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.summary} testID="blotter-fills-summary">
        {summary.fills} FILLS · <Text style={styles.buys}>{summary.buys}B</Text>
        /<Text style={styles.sells}>{summary.sells}S</Text>
      </Text>
    </View>
  );
}

interface BlotterFilterBarProps {
  selected: BlotterFilter;
  onSelect: (filter: BlotterFilter) => void;
  summary: BlotterSummary;
}

interface BlotterFilterBarStyles {
  row: ViewStyle;
  scroll: ViewStyle;
  chips: ViewStyle;
  pill: ViewStyle;
  pillActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
  summary: TextStyle;
  buys: TextStyle;
  sells: TextStyle;
}

function makeStyles(t: RnTheme): BlotterFilterBarStyles {
  // Chip-label base: shared by the inactive/active label variants (TradeRow's
  // `direction`/`pill` local-base idiom — spread into each variant below).
  const label: TextStyle = {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    fontFamily: t.fontMono,
  };

  // Fills-summary base: shared by the summary text and its buy/sell inline
  // spans (a slightly tighter letterSpacing than the chip labels).
  const metric: TextStyle = {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    fontFamily: t.fontMono,
  };

  // Chip-shape base: shared by the inactive/active pill layout.
  const pill: ViewStyle = {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  };

  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    // flexGrow/flexShrink: 0 — otherwise the ScrollView absorbs leftover
    // flex height from the row and its Pressable children balloon into
    // full-height vertical bars (the Phase 4a chip defect).
    scroll: { flexGrow: 0, flexShrink: 0 },
    chips: {
      gap: 7,
      paddingHorizontal: 12,
      paddingTop: 10,
      // Prototype bar is `padding: 10px 12px 8px` (dc.html:134); Phase 4a's
      // `RateFilterBar` value of 2 was invisible there because the next
      // element was a grid — here it's the bordered column header, where the
      // gap shows.
      paddingBottom: 8,
      alignItems: "center",
    },
    pill: { ...pill, backgroundColor: "transparent", borderColor: t.border },
    pillActive: {
      ...pill,
      backgroundColor: t.accentPrimary,
      borderColor: t.accentPrimary,
    },
    label: { ...label, color: t.textSecondary },
    labelActive: { ...label, color: t.textOnAccent },
    summary: {
      ...metric,
      flex: 1,
      textAlign: "right",
      paddingRight: SPACING.md,
      // Prototype's summary is `var(--faint)` (dc.html:138) → `textMuted`,
      // matching `BlotterHeader`'s column labels on the same screen —
      // `textSecondary` is the prototype's `T.dim`, reserved for the
      // inactive chip label.
      color: t.textMuted,
    },
    buys: { ...metric, color: t.accentPositive },
    sells: { ...metric, color: t.accentNegative },
  });
}
