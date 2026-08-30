import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The mobile-v1 segmented pill: a clipped `1px --border` frame holding a row
 * of cells, the active one filled with the accent and lettered `--onAcc`, each
 * labelled in tracked 9px mono. The design uses that one control in three
 * places, and this is all three of them — the Credit/Equities sub-nav
 * (`credTabs`/`eqTabs`), the appearance sheet's inline dark/light pill, and the
 * two full-width segments below the sheet's own rows.
 *
 * The three differ only in geometry, and `variant` selects between three
 * complete style bundles rather than multiplying flags inside one sheet: the
 * sub-nav is inset and divides its row equally, the mode pill is intrinsically
 * sized (it shares a row with the APPEARANCE title, which is the element that
 * gives way), the sheet segments divide their row like the sub-nav but carry
 * none of its inset. Every value is the one its site shipped — this control is
 * pixel-pinned by the committed goldens.
 *
 * Test ids are per-segment and explicit, never derived here: the three sites
 * name their cells on three different schemes, all of them load-bearing for
 * the jest and e2e contracts. Every current call site announces its cells as
 * `tab`s, so the role is fixed rather than a prop. Uppercasing is the
 * caller's — the labels are copy, not a transform. */
export function SegmentedPill<K extends string>({
  segments,
  value,
  onChange,
  variant,
  frameTestID,
}: SegmentedPillProps<K>): JSX.Element {
  const styles = useThemedStyles(makeStyles)[variant];

  return (
    <View style={styles.frame} testID={frameTestID}>
      {segments.map((segment) => {
        const active = segment.key === value;
        // One string child, not a glyph node beside a label node: the cells
        // lay out as a column, so a second child would stack under the label
        // rather than sit before it.
        const text =
          segment.glyph === undefined
            ? segment.label
            : `${segment.glyph} ${segment.label}`;

        return (
          <Pressable
            key={segment.key}
            testID={segment.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={active ? styles.cellActive : styles.cell}
            onPress={() => {
              onChange(segment.key);
            }}
          >
            <Text style={active ? styles.labelActive : styles.label}>
              {text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface PillSegment<K extends string> {
  readonly key: K;
  readonly label: string;
  /** Prefixed to the label inside the same Text node, separated by one space
   * — the mode pill's moon and sun. */
  readonly glyph?: string;
  readonly testID: string;
}

interface SegmentedPillProps<K extends string> {
  readonly segments: readonly PillSegment<K>[];
  readonly value: K;
  /** Slot: fired with the cell that was pressed, active or not. */
  readonly onChange: (key: K) => void;
  readonly variant: SegmentedPillVariant;
  /** Optional: the sheet's power-saver segment is the one site whose frame
   * carries no id of its own. */
  readonly frameTestID?: string;
}

type SegmentedPillVariant = "subNav" | "modePill" | "sheetSegment";

interface SegmentedPillStyles {
  frame: ViewStyle;
  cell: ViewStyle;
  cellActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
}

function makeStyles(
  t: RnTheme,
): Record<SegmentedPillVariant, SegmentedPillStyles> {
  // The design's frame, shared by all three: `1px --border`, clipped so the
  // active cell's fill is cut by the corner radius.
  const frame: ViewStyle = {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: t.borderPrimary,
    overflow: "hidden",
  };

  // Equal thirds, safe by construction at any width — no wrap or clip
  // threshold to cross silently.
  const wideCell: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
  };

  // The design's cells are `padding: 8px 14px`. 11 here, not 14: the mode
  // pill's third AUTO cell is ~56pt of width the design never budgeted for,
  // and at 14 the title + pill overflow a 320pt device's content row.
  // Trimming the horizontal padding is the smallest change that keeps all
  // three cells and the design's type, and it is the only value on that
  // control that deviates.
  const snugCell: ViewStyle = { paddingVertical: 8, paddingHorizontal: 11 };

  const boldLabel: TextStyle = labelStyle(t, 9, 1.5, "600");
  const plainLabel: TextStyle = labelStyle(t, 9, 1.5);

  return {
    // Design: inset `10px 12px 0` under the screen header, radius 9.
    subNav: StyleSheet.create({
      frame: { ...frame, marginTop: 10, marginHorizontal: 12, borderRadius: 9 },
      cell: wideCell,
      cellActive: { ...wideCell, backgroundColor: t.accentPrimary },
      label: { ...boldLabel, color: t.textSecondary },
      labelActive: { ...boldLabel, color: t.textOnAccent },
    }),
    // Design: the appearance sheet's inline selector, radius 8.
    modePill: StyleSheet.create({
      frame: { ...frame, borderRadius: 8 },
      cell: snugCell,
      cellActive: { ...snugCell, backgroundColor: t.accentPrimary },
      label: { ...plainLabel, color: t.textSecondary },
      labelActive: { ...plainLabel, color: t.textOnAccent },
    }),
    // The sub-nav's frame without its inset — these sit inside the sheet's
    // own padded sections.
    sheetSegment: StyleSheet.create({
      frame: { ...frame, borderRadius: 9 },
      cell: wideCell,
      cellActive: { ...wideCell, backgroundColor: t.accentPrimary },
      label: { ...boldLabel, color: t.textSecondary },
      labelActive: { ...boldLabel, color: t.textOnAccent },
    }),
  };
}
