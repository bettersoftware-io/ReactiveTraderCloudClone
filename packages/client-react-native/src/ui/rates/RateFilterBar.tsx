import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useTheme } from "#/ui/theme/useTheme";

import { RATE_FILTERS, type RateFilter } from "./ratesFilter";

export function RateFilterBar({
  selected,
  onSelect,
}: RateFilterBarProps): JSX.Element {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      testID="rate-filter-bar"
    >
      {RATE_FILTERS.map((filter) => {
        const active = filter === selected;
        return (
          <Pressable
            key={filter}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onSelect(filter);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: active ? theme.accentPrimary : "transparent",
                borderColor: active ? theme.accentPrimary : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? theme.textOnAccent : theme.textSecondary,
                  fontFamily: theme.fontMono,
                },
              ]}
            >
              {filter}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface RateFilterBarProps {
  selected: RateFilter;
  onSelect: (filter: RateFilter) => void;
}

const styles = StyleSheet.create({
  // flexGrow/flexShrink: 0 — a short filter (e.g. JPY, 3 tiles) leaves the
  // ScrollView's parent with leftover flex height; without this the
  // ScrollView itself stretches to absorb it, and its Pressable children
  // (sized by the row's alignItems) balloon into giant vertical bars.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: {
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
  },
  label: { fontSize: 10, fontWeight: "600", letterSpacing: 1 },
});
