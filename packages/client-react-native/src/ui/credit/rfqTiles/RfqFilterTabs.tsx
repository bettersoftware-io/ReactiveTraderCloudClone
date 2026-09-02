import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { CreditRfqFilter } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import {
  RFQ_FILTER_LABELS,
  RFQ_FILTERS,
} from "#/ui/credit/rfqTiles/rfqTileFilter";
import { labelStyle } from "#/ui/theme/labelStyle";
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

  function selectFilterFor(f: CreditRfqFilter): () => void {
    return () => {
      setFilter(f);
    };
  }

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
            onPress={selectFilterFor(f)}
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
  // dc.html:216 — a fully-rounded pill, `5px 11px`, ALWAYS a 1px border, and
  // 9.5px/600 mono at letter-spacing 1. The border is the load-bearing part:
  // the app's inactive chip was a filled `panel` rectangle, so the row read as
  // three solid blocks rather than the design's outlines with one filled.
  const tab: ViewStyle = {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.borderPrimary,
    backgroundColor: "transparent",
  };

  const label: TextStyle = {
    ...labelStyle(t, 9.5, 1, "600"),
    color: t.textSecondary,
  };

  return StyleSheet.create({
    // dc.html:215 — `gap: 7`, `padding: 9px 12px 1px`.
    tabs: {
      flexDirection: "row",
      gap: 7,
      paddingTop: 9,
      paddingHorizontal: 12,
      paddingBottom: 1,
    },
    tab,
    tabActive: {
      ...tab,
      borderColor: t.accentPrimary,
      backgroundColor: t.accentPrimary,
    },
    label,
    labelActive: { ...label, color: t.textOnAccent },
  });
}
