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
        <Text style={styles.divider}>/</Text>
        <Text style={styles.sells}>{summary.sells}S</Text>
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
  divider: TextStyle;
  buys: TextStyle;
  sells: TextStyle;
}

function makeStyles(t: RnTheme): BlotterFilterBarStyles {
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
      paddingBottom: 2,
      alignItems: "center",
    },
    pill: {
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: "transparent",
      borderColor: t.border,
    },
    pillActive: {
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: t.accentPrimary,
      borderColor: t.accentPrimary,
    },
    label: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    labelActive: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1,
      color: t.textOnAccent,
      fontFamily: t.fontMono,
    },
    summary: {
      flex: 1,
      textAlign: "right",
      paddingRight: SPACING.md,
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    divider: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    buys: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: t.accentPositive,
      fontFamily: t.fontMono,
    },
    sells: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: t.accentNegative,
      fontFamily: t.fontMono,
    },
  });
}
