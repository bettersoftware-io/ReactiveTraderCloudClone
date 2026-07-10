import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export type CreditView = "tiles" | "new-rfq" | "sell-side";

interface CreditTab {
  view: CreditView;
  label: string;
}

const TABS: readonly CreditTab[] = [
  { view: "tiles", label: "RFQ Tiles" },
  { view: "new-rfq", label: "New RFQ" },
  { view: "sell-side", label: "Sell Side" },
];

interface CreditNavProps {
  view: CreditView;
  onChange: (view: CreditView) => void;
}

export function CreditNav({ view, onChange }: CreditNavProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.nav} testID="credit-nav">
      {TABS.map((tab) => {
        const active = tab.view === view;
        return (
          <Pressable
            key={tab.view}
            testID={`credit-tab-${tab.view}`}
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

interface CreditNavStyles {
  nav: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): CreditNavStyles {
  return StyleSheet.create({
    nav: {
      flexDirection: "row",
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    tab: { flex: 1, alignItems: "center", paddingVertical: SPACING.md },
    tabActive: {
      flex: 1,
      alignItems: "center",
      paddingVertical: SPACING.md,
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
