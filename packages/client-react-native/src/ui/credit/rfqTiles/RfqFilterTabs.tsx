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

import {
  RFQ_FILTER_LABELS,
  RFQ_FILTERS,
} from "#/ui/credit/rfqTiles/rfqTileFilter";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The LIVE/DONE/ALL chips above the RFQ tiles. Reads and writes the shared
 * `useCreditRfqFilterPreference` seam rather than local state, so the choice
 * persists across navigation and matches the web client's — RN was the only
 * client still holding its own copy. */
export function RfqFilterTabs(): JSX.Element {
  const { useCreditRfqFilterPreference } = useViewModel();
  const { filter, setFilter } = useCreditRfqFilterPreference();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tabs}>
      {RFQ_FILTERS.map((f) => {
        const active = filter === f;
        return (
          <Pressable
            key={f}
            testID={`rfq-filter-${f}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              setFilter(f);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {RFQ_FILTER_LABELS[f]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
    label: {
      fontSize: 9,
      letterSpacing: 1.4,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    labelActive: {
      fontSize: 9,
      letterSpacing: 1.4,
      color: t.textOnAccent,
      fontFamily: t.fontMono,
    },
  });
}
