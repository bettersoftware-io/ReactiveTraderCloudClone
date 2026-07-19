import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { JSX } from "react";
import { useState } from "react";
import { ScrollView, StyleSheet, type ViewStyle } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RateFilterBar } from "#/ui/rates/RateFilterBar";
import { filterPairs, type RateFilter } from "#/ui/rates/ratesFilter";
import { SpotTileGrid } from "#/ui/rates/SpotTileGrid";
import { TradeTicketSheet } from "#/ui/rates/ticket/TradeTicketSheet";

/** The Rates module screen root: the filter pill bar over the animated
 * spot-tile grid, driven by the live `useCurrencyPairs()` stream, plus the
 * trade ticket sheet it hosts. The selected-pair state is held here (not in
 * the grid) so it can gate the ticket: selecting a tile presents it,
 * dismissing it clears the selection. `BottomSheetModalProvider` only needs a
 * `GestureHandlerRootView` above it, which the app root already provides.
 * Named export (repo policy bans default exports outside `app/**` route
 * files/config); the route re-exports its own default from this. */
export function RatesModule(): JSX.Element {
  const [filter, setFilter] = useState<RateFilter>("ALL");
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  const shown = filterPairs(pairs, filter);
  const [selectedPair, setSelectedPair] = useState<CurrencyPair | null>(null);

  return (
    <BottomSheetModalProvider>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <RateFilterBar selected={filter} onSelect={setFilter} />
        <SpotTileGrid pairs={shown} onOpenTicket={setSelectedPair} />
      </ScrollView>
      {selectedPair !== null ? (
        <TradeTicketSheet
          pair={selectedPair}
          onClose={() => {
            setSelectedPair(null);
          }}
        />
      ) : null}
    </BottomSheetModalProvider>
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
