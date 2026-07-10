import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Segmented control over the three equities sub-views. Mirrors `CreditNav`. */
export function EquitiesNav({ view, onChange }: EquitiesNavProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.nav} testID="equities-nav">
      {TABS.map((tab) => {
        const active = tab.view === view;
        return (
          <Pressable
            key={tab.view}
            testID={`equities-tab-${tab.view}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onChange(tab.view);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type EquitiesView = "markets" | "trade" | "blotters";

interface EquitiesTab {
  view: EquitiesView;
  label: string;
}

const TABS: readonly EquitiesTab[] = [
  { view: "markets", label: "Markets" },
  { view: "trade", label: "Trade" },
  { view: "blotters", label: "Blotters" },
];

interface EquitiesNavProps {
  view: EquitiesView;
  onChange: (view: EquitiesView) => void;
}

interface EquitiesNavStyles {
  nav: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): EquitiesNavStyles {
  const baseTab: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  };
  return StyleSheet.create({
    nav: {
      flexDirection: "row",
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    tab: baseTab,
    tabActive: {
      ...baseTab,
      borderBottomWidth: 2,
      borderBottomColor: t.accentPrimary,
    },
    label: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: {
      fontSize: 13,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
  });
}
