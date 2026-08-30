import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The mobile-v1 section caption — `ORDERS`, `POSITIONS` — the design's
 * 8.5px mono, 2px-tracked, faint label above a card list (mirrors
 * `SellSidePanel`'s `sectionLabel`). `spaced` adds the design's 12px top
 * margin for a label that follows another section. */
export function SectionLabel({
  children,
  spaced = false,
}: SectionLabelProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <Text style={[styles.label, spaced ? styles.spaced : null]}>
      {children}
    </Text>
  );
}

interface SectionLabelProps {
  readonly children: string;
  readonly spaced?: boolean;
}

interface SectionLabelStyles {
  label: TextStyle;
  spaced: TextStyle;
}

function makeStyles(t: RnTheme): SectionLabelStyles {
  return StyleSheet.create({
    label: {
      ...labelStyle(t, 8.5, 2),
      color: t.textMuted,
      marginHorizontal: 2,
      marginTop: 3,
      marginBottom: 7,
    },
    spaced: { marginTop: 12 },
  });
}
