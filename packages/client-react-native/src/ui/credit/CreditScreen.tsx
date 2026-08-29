import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { CreditNav, type CreditView } from "#/ui/credit/CreditNav";
import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";

/** The Credit tab: a segmented control over three sub-views (RFQ Tiles / New
 * RFQ / Sell Side), mirroring the web `CreditWorkspace`. New-RFQ success snaps
 * back to the tiles view. Composition/toolbar/banner live one level up in
 * `_layout`. */
export function CreditScreen(): JSX.Element {
  const [view, setView] = useState<CreditView>("tiles");

  function showTilesView(): void {
    setView("tiles");
  }

  return (
    <View style={styles.screen} testID="credit-screen">
      <CreditNav view={view} onChange={setView} />
      {view === "tiles" ? <RfqTilesPanel /> : null}
      {view === "new-rfq" ? <NewRfqForm onCreated={showTilesView} /> : null}
      {view === "sell-side" ? <SellSidePanel /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No background: the module body is transparent so the shell's ambient HUD
  // grid shows through, as the mobile-v1 design has it on every screen.
  screen: { flex: 1 },
});
