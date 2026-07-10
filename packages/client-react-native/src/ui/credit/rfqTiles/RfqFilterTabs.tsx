import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  RFQ_FILTERS,
  type RfqFilter,
} from "#/ui/credit/rfqTiles/rfqTileFilter";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqFilterTabs({
  selected,
  onChange,
}: RfqFilterTabsProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tabs}>
      {RFQ_FILTERS.map((f) => {
        const active = selected === f;
        return (
          <Pressable
            key={f}
            testID={`rfq-filter-${f}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onChange(f);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>{f}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface RfqFilterTabsProps {
  selected: RfqFilter;
  onChange: (filter: RfqFilter) => void;
}

interface RfqFilterTabsStyles {
  tabs: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): RfqFilterTabsStyles {
  return StyleSheet.create({
    tabs: { flexDirection: "row", gap: 6, padding: SPACING.sm },
    tab: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.panel,
    },
    tabActive: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.bgBrandPrimary,
    },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: {
      fontSize: 12,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
  });
}
