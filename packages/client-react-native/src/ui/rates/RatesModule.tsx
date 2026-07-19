import type { JSX } from "react";
import { useState } from "react";
import { ScrollView, StyleSheet, type ViewStyle } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RateFilterBar } from "#/ui/rates/RateFilterBar";
import { filterPairs, type RateFilter } from "#/ui/rates/ratesFilter";
import { SpotTileGrid } from "#/ui/rates/SpotTileGrid";

/** The Rates module screen root: the filter pill bar over the animated
 * spot-tile grid, driven by the live `useCurrencyPairs()` stream. The
 * selected-pair state is held here (not in the grid) because it will also
 * host the trade ticket sheet in a later task — `onOpenTicket` is already
 * wired to the setter so that follow-up is a small diff. Named export (repo
 * policy bans default exports outside `app/**` route files/config); the route
 * re-exports its own default from this. */
export function RatesModule(): JSX.Element {
  const [filter, setFilter] = useState<RateFilter>("ALL");
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  const shown = filterPairs(pairs, filter);
  // selectedPair state consumed by TradeTicketSheet in Task 11.
  const [, setSelectedPair] = useState<CurrencyPair | null>(null);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <RateFilterBar selected={filter} onSelect={setFilter} />
      <SpotTileGrid pairs={shown} onOpenTicket={setSelectedPair} />
    </ScrollView>
  );
}

interface RatesModuleStyles {
  root: ViewStyle;
  content: ViewStyle;
}

const styles: RatesModuleStyles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
});
