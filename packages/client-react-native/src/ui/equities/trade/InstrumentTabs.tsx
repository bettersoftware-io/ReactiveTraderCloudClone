import type { JSX } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** Horizontal symbol quick-switch strip, styled as the mobile-v1 chip row:
 * mono, radius 7, the selected chip on the `chip` fill with the accent for
 * text and border, the rest transparent on the subtle border. Ported from
 * web `InstrumentTabs`. */
export function InstrumentTabs({
  selectedSymbol,
  onSelect,
}: InstrumentTabsProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {instruments.map((inst) => {
        const active = inst.symbol === selectedSymbol;
        return (
          <Pressable
            key={inst.symbol}
            testID={`instrument-tab-${inst.symbol}`}
            style={active ? styles.tabActive : styles.tab}
            onPress={() => {
              onSelect(inst.symbol);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {inst.symbol}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface InstrumentTabsProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface InstrumentTabsStyles {
  strip: ViewStyle;
  content: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentTabsStyles {
  const baseTab: ViewStyle = {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  };

  const baseLabel: TextStyle = {
    fontSize: 9.5,
    ...weightedFont(t, "mono", "600"),
  };
  return StyleSheet.create({
    strip: { flexGrow: 0 },
    content: { gap: 6, paddingBottom: 9 },
    tab: baseTab,
    tabActive: {
      ...baseTab,
      backgroundColor: t.chip,
      borderColor: t.accentPrimary,
    },
    label: { ...baseLabel, color: t.textSecondary },
    labelActive: { ...baseLabel, color: t.accentPrimary },
  });
}
