import { useCallback, useState } from "react";
import { CreditBlotter } from "./blotter/CreditBlotter";
import styles from "./CreditWorkspace.module.css";
import { NewRfqForm } from "./newRfq/NewRfqForm";
import { RfqTilesPanel } from "./rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "./sellSide/SellSidePanel";

type CreditView = "tiles" | "new-rfq" | "sell-side";

export function CreditWorkspace() {
  const [view, setView] = useState<CreditView>("tiles");

  const handleRfqCreated = useCallback(() => {
    setView("tiles");
  }, []);

  return (
    <div className={styles.workspace}>
      <div data-testid="credit-nav" className={styles.nav}>
        {(["tiles", "new-rfq", "sell-side"] as const).map((v) => (
          <button
            key={v}
            data-testid={`credit-tab-${v}`}
            data-active={view === v ? "true" : "false"}
            onClick={() => setView(v)}
            className={styles.tab}
          >
            {v === "tiles"
              ? "RFQ Tiles"
              : v === "new-rfq"
                ? "New RFQ"
                : "Sell Side"}
          </button>
        ))}
      </div>

      {view === "new-rfq" && <NewRfqForm onCreated={handleRfqCreated} />}
      {view === "tiles" && <RfqTilesPanel />}
      {view === "sell-side" && <SellSidePanel />}

      <CreditBlotter />
    </div>
  );
}
