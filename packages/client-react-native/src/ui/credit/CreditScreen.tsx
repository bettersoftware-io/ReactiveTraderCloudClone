import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { CreditNav, type CreditView } from "#/ui/credit/CreditNav";
import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The Credit tab: a segmented control over three sub-views (RFQ Tiles / New
 * RFQ / Sell Side), mirroring the web `CreditWorkspace`. New-RFQ success snaps
 * back to the tiles view. Composition/toolbar/banner live one level up in
 * `_layout`. */
export function CreditScreen(): JSX.Element {
  const [view, setView] = useState<CreditView>("tiles");
  const styles = useThemedStyles(makeStyles);

  function handleCreated(): void {
    setView("tiles");
  }

  return (
    <View style={styles.screen} testID="credit-screen">
      <CreditNav view={view} onChange={setView} />
      {view === "tiles" ? <RfqTilesPanel /> : null}
      {view === "new-rfq" ? <NewRfqForm onCreated={handleCreated} /> : null}
      {view === "sell-side" ? <SellSidePanel /> : null}
    </View>
  );
}

interface CreditScreenStyles {
  screen: ViewStyle;
}

function makeStyles(t: RnTheme): CreditScreenStyles {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bgPrimary },
  });
}
