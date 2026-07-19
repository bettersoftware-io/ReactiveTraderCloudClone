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
  row: { gap: 7, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  pill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: 10, fontWeight: "600", letterSpacing: 1 },
});
