import { type JSX, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { EquitiesNav, type EquitiesView } from "#/ui/equities/EquitiesNav";
import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { TradeView } from "#/ui/equities/trade/TradeView";

/** The Equities tab: a segmented control over Markets / Trade / Blotters.
 * Selecting an instrument in Markets jumps to Trade, while the Trade
 * quick-switch tabs change symbol in place.
 *
 * The selected symbol is the shared equities workspace's (`useEqWorkspace`),
 * the same singleton the web clients read — not screen-local state — so it
 * survives leaving the tab and anything else that drives the workspace (Jarvis
 * app-driving) moves this screen too. Which of the three views is showing has
 * no shared counterpart and stays local. An empty `sel` is the workspace's
 * "nothing selected yet" (the watchlist had not arrived at composition). */
export function EquitiesScreen(): JSX.Element {
  const { useEqWorkspace } = useViewModel();
  const { state, select } = useEqWorkspace();
  const [view, setView] = useState<EquitiesView>("markets");
  const selectedSymbol = state.sel === "" ? null : state.sel;

  function selectFromMarkets(symbol: string): void {
    select(symbol);
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
        <TradeView selectedSymbol={selectedSymbol} onSelect={select} />
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
