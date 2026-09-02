// packages/client-react-native/src/ui/credit/newRfq/QuantityChips.tsx
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
  millionsLabel,
  RFQ_QUANTITY_CHIPS,
} from "#/ui/credit/newRfq/rfqQuantities";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** The New-RFQ size picker: four fixed notional chips (prototype
 * dc.html:277-281), replacing the free-text quantity field this ports from.
 *
 * This trades arbitrary sizes for a one-tap common case — deliberate, per the
 * Phase 5 design, and matching what the desk actually broadcasts. If an odd
 * size is ever needed the field comes back; the chips do not grow. */
export function QuantityChips({
  selected,
  onSelect,
}: QuantityChipsProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  function selectQuantityFor(quantity: number): () => void {
    return () => {
      onSelect(quantity);
    };
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>QUANTITY · USD</Text>
      <View style={styles.row}>
        {RFQ_QUANTITY_CHIPS.map((quantity) => {
          const active = quantity === selected;
          return (
            <Pressable
              key={quantity}
              testID={`quantity-chip-${quantity}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={active ? styles.chipActive : styles.chip}
              onPress={selectQuantityFor(quantity)}
            >
              <Text style={active ? styles.chipLabelActive : styles.chipLabel}>
                {millionsLabel(quantity)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface QuantityChipsProps {
  readonly selected: number | null;
  readonly onSelect: (quantity: number) => void;
}

interface QuantityChipsStyles {
  field: ViewStyle;
  label: TextStyle;
  row: ViewStyle;
  chip: ViewStyle;
  chipActive: ViewStyle;
  chipLabel: TextStyle;
  chipLabelActive: TextStyle;
}

function makeStyles(t: RnTheme): QuantityChipsStyles {
  // dc.html:279 — `10px/600`, `padding: 9px 0`, `radius 8`, 1px border, each
  // chip `flex: 1` across a 7px-gapped row.
  const chip: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    backgroundColor: "transparent",
  };

  const chipLabel: TextStyle = {
    fontSize: 10,
    ...weightedFont(t, "mono", "600"),
    color: t.textMuted,
  };

  return StyleSheet.create({
    field: { gap: 8 },
    label: {
      ...labelStyle(t, 8.5, 2),
      color: t.textMuted,
    },
    row: { flexDirection: "row", gap: 7 },
    chip,
    // dc.html:2183 — `bg: on ? T.chip : 'transparent'`, the same accent wash
    // `InstrumentChipGrid` uses; see its note on why `bgSecondary` was wrong.
    chipActive: {
      ...chip,
      borderColor: t.accentPrimary,
      backgroundColor: t.chip,
    },
    chipLabel,
    chipLabelActive: { ...chipLabel, color: t.accentPrimary },
  });
}
