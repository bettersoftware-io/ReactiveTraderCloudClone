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
 * pills over `EQ_WATCHLIST_SORTS`, bound to the shared `useEqWatchlistSort()`
 * preference via its real `setSort` intent. The **web** client renders the
 * equivalent control as a single tap-to-cycle chip (`EqWatchlistHead` calls
 * `cycle`); the mobile design instead shows all three sorts at once as
 * independently pressable pills, so this reads/writes the preference
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
            <Text style={active ? styles.chipLabelActive : styles.chipLabel}>
              {RANK_LABEL[target]}
            </Text>
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
  chipLabelActive: TextStyle;
}

function makeStyles(t: RnTheme): RankByChipsStyles {
  // The design's pill (dc.html ~L335): `border-radius:999px`, `padding:5px
  // 10px`, a 1px border — selected is a solid accent fill, unselected is
  // transparent over the plain border.
  const chipBase: ViewStyle = {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  };

  const chipLabelBase: TextStyle = {
    fontSize: 9,
    letterSpacing: 1,
    ...weightedFont(t, "mono", "600"),
  };

  return StyleSheet.create({
    // `alignItems: "center"` + each chip's own `flexGrow: 0` / `flexShrink: 0`
    // (below) is what keeps this a short horizontal strip rather than the
    // Phase 4a full-height-bar bug — a row of short chips stretching to fill
    // the container's cross-axis height.
    row: { flexDirection: "row", alignItems: "center", gap: 7 },
    label: {
      fontSize: 8,
      letterSpacing: 1.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    chip: {
      ...chipBase,
      backgroundColor: "transparent",
      borderColor: t.borderPrimary,
    },
    chipActive: {
      ...chipBase,
      backgroundColor: t.accentPrimary,
      borderColor: t.accentPrimary,
    },
    chipLabel: { ...chipLabelBase, color: t.textSecondary },
    chipLabelActive: { ...chipLabelBase, color: t.textOnAccent },
  });
}
