import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { EquitiesNav, type EquitiesView } from "#/ui/equities/EquitiesNav";
import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { TradeView } from "#/ui/equities/trade/TradeView";

/** The Equities tab: a segmented control over Markets / Trade / Blotters. The
 * selected symbol is lifted here; selecting an instrument in Markets jumps to
 * Trade, while the Trade quick-switch tabs change symbol in place. */
export function EquitiesScreen(): JSX.Element {
  const [view, setView] = useState<EquitiesView>("markets");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  function selectFromMarkets(symbol: string): void {
    setSelectedSymbol(symbol);
    setView("trade");
  }

  return (
    <View style={styles.screen} testID="equities-screen">
      <EquitiesNav view={view} onChange={setView} />
      {view === "markets" ? (
        <MarketsView
          selectedSymbol={selectedSymbol}
          onSelect={selectFromMarkets}
        />
      ) : null}
      {view === "trade" ? (
        <TradeView
          selectedSymbol={selectedSymbol}
          onSelect={setSelectedSymbol}
        />
      ) : null}
      {view === "blotters" ? <BlottersView /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No background: the module body is transparent so the shell's ambient HUD
  // grid shows through, as the mobile-v1 design has it on every screen.
  screen: { flex: 1 },
});
