// packages/client-react-native/src/ui/credit/newRfq/InstrumentChipGrid.tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Instrument } from "@rtc/domain";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The New-RFQ instrument picker: a two-column chip grid (prototype
 * dc.html:262-266), replacing the free-text search this ports from.
 *
 * **It wraps rather than scrolling horizontally.** The prototype hardcodes six
 * instruments; real `useInstruments()` data does not, so a seventh must stay
 * reachable. Wrapping keeps every chip on screen inside the form's own vertical
 * scroll — a horizontal rail would push the overflow out of sight, which on a
 * picker is worse than a taller grid. */
export function InstrumentChipGrid({
  instruments,
  selectedId,
  onSelect,
}: InstrumentChipGridProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>INSTRUMENT</Text>
      <View style={styles.grid}>
        {instruments.map((instrument) => {
          const active = instrument.id === selectedId;
          return (
            <Pressable
              key={instrument.id}
              testID={`instrument-chip-${instrument.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={active ? styles.chipActive : styles.chip}
              onPress={() => {
                onSelect(instrument.id);
              }}
            >
              <Text
                numberOfLines={2}
                style={active ? styles.chipLabelActive : styles.chipLabel}
              >
                {instrument.ticker || instrument.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface InstrumentChipGridProps {
  readonly instruments: readonly Instrument[];
  readonly selectedId: number | null;
  readonly onSelect: (instrumentId: number) => void;
}

interface InstrumentChipGridStyles {
  field: ViewStyle;
  label: TextStyle;
  grid: ViewStyle;
  chip: ViewStyle;
  chipActive: ViewStyle;
  chipLabel: TextStyle;
  chipLabelActive: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentChipGridStyles {
  // dc.html:264 — `9.5px` mono, `padding: 10px 8px`, `radius 9`, 1px border,
  // left-aligned, in a `1fr 1fr` grid with a 7px gap.
  const chip: ViewStyle = {
    // Two columns with a 7px gutter: each chip takes just under half.
    width: "48%",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    backgroundColor: "transparent",
  };

  const chipLabel: TextStyle = {
    fontSize: 9.5,
    fontFamily: t.fontMono,
    color: t.textMuted,
    textAlign: "left",
  };

  return StyleSheet.create({
    field: { gap: 8 },
    label: {
      ...labelStyle(t, 8.5, 2),
      color: t.textMuted,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip,
    // dc.html:2179 — `bg: on ? T.chip : 'transparent'`. `chip` is the skin's
    // own accent-at-12% wash, so the selected chip reads as a tint OF the
    // accent that rings it; `bgSecondary` (what this was until the
    // mobile-v1 fidelity pass) is an opaque neutral surface, which on the
    // 3D skins painted a grey block inside a cyan border.
    chipActive: {
      ...chip,
      borderColor: t.accentPrimary,
      backgroundColor: t.chip,
    },
    chipLabel,
    chipLabelActive: { ...chipLabel, color: t.accentPrimary },
  });
}
