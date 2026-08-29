import type { JSX } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { SectionLabel } from "#/ui/equities/SectionLabel";

/** Blotters sub-view: the mobile-v1 layout — ORDERS and POSITIONS stacked on
 * one scroll, each under a mono section label. Until 2026-08-29 this was an
 * Orders/Positions toggle showing one blotter at a time (with an `initialTab`
 * seam the visual harness used to pin the hidden tab); the design shows both. */
export function BlottersView(): JSX.Element {
  return (
    <ScrollView
      testID="blotters-view"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <SectionLabel>ORDERS</SectionLabel>
      <OrdersBlotter />
      <SectionLabel spaced>POSITIONS</SectionLabel>
      <PositionsBlotter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Transparent: the shell's ambient grid shows through, as in the design.
  scroll: { flex: 1 },
  content: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8 },
});
