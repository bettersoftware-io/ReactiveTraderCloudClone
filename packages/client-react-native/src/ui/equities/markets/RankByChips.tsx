import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { EqWatchlistSort } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RANK_DISPLAY_ORDER } from "#/ui/equities/markets/rankByLayout";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** Markets screen's `RANK BY` control: a label plus three directly-selectable
 * chips over `EQ_WATCHLIST_SORTS`, bound to the shared `useEqWatchlistSort()`
 * preference via its real `setSort` intent. The **web** client renders the
 * equivalent control as a single tap-to-cycle chip (`EqWatchlistHead` calls
 * `cycle`); the mobile design instead shows all three sorts at once as
 * independently pressable chips, so this reads/writes the preference
 * directly rather than mirroring that cycling idiom. */
export function RankByChips(): JSX.Element {
  const { useEqWatchlistSort } = useViewModel();
  const { sort, setSort } = useEqWatchlistSort();
  const styles = useThemedStyles(makeStyles);

  return (
    <View testID="eq-rank-row" style={styles.row}>
      <Text style={styles.label}>RANK BY</Text>
      {RANK_DISPLAY_ORDER.map((target) => {
        const active = target === sort;
        return (
          <Pressable
            key={target}
            testID={`eq-rank-${target}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={active ? styles.chipActive : styles.chip}
            onPress={() => {
              setSort(target);
            }}
          >
            <Text style={styles.chipLabel}>{RANK_LABEL[target]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const RANK_LABEL: Record<EqWatchlistSort, string> = {
  chg: "% CHG",
  price: "PRICE",
  sym: "A–Z",
};

interface RankByChipsStyles {
  row: ViewStyle;
  label: TextStyle;
  chip: ViewStyle;
  chipActive: ViewStyle;
  chipLabel: TextStyle;
}

function makeStyles(t: RnTheme): RankByChipsStyles {
  const chipBase: ViewStyle = {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
  };

  return StyleSheet.create({
    // `alignItems: "center"` + each chip's own `flexGrow: 0` / `flexShrink: 0`
    // (below) is what keeps this a short horizontal strip rather than the
    // Phase 4a full-height-bar bug — a row of short chips stretching to fill
    // the container's cross-axis height.
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    label: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      marginRight: 2,
    },
    chip: { ...chipBase, backgroundColor: t.panel },
    chipActive: {
      ...chipBase,
      backgroundColor: t.chip,
      borderColor: t.accentPrimary,
    },
    chipLabel: {
      fontSize: 11,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
  });
}
