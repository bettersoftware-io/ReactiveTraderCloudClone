import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Blotters sub-view: the mobile-v1 layout — ORDERS and POSITIONS stacked on
 * one scroll, each under a mono section label. Until 2026-08-29 this was an
 * Orders/Positions toggle showing one blotter at a time (with an `initialTab`
 * seam the visual harness used to pin the hidden tab); the design shows both. */
export function BlottersView(): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      testID="blotters-view"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.sectionLabel}>ORDERS</Text>
      <OrdersBlotter />
      <Text style={[styles.sectionLabel, styles.sectionLabelBelow]}>
        POSITIONS
      </Text>
      <PositionsBlotter />
    </ScrollView>
  );
}

interface BlottersViewStyles {
  scroll: ViewStyle;
  content: ViewStyle;
  sectionLabel: TextStyle;
  sectionLabelBelow: TextStyle;
}

function makeStyles(t: RnTheme): BlottersViewStyles {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bgPrimary },
    content: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8 },
    // Mirrors `SellSidePanel`'s `sectionLabel`: the design's 8.5px mono,
    // 2px-tracked, faint section caption.
    sectionLabel: {
      fontSize: 8.5,
      letterSpacing: 2,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginHorizontal: 2,
      marginTop: 3,
      marginBottom: 7,
    },
    sectionLabelBelow: { marginTop: 12 },
  });
}
