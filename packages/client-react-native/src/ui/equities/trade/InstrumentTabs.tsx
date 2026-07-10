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

/** Horizontal symbol quick-switch strip. Ported from web `InstrumentTabs`. */
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
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
  };
  return StyleSheet.create({
    strip: { flexGrow: 0, backgroundColor: t.bgHeader },
    content: { gap: 6, padding: SPACING.sm },
    tab: baseTab,
    tabActive: {
      ...baseTab,
      backgroundColor: t.chip,
      borderColor: t.accentPrimary,
    },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontMono },
    labelActive: {
      fontSize: 12,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
  });
}
