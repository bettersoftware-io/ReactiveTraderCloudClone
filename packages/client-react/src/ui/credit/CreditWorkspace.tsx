import type { ReactElement } from "react";
import { useState } from "react";

import { CreditBlotter } from "./blotter/CreditBlotter";
import { NewRfqForm } from "./newRfq/NewRfqForm";
import { RfqTilesPanel } from "./rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "./sellSide/SellSidePanel";

import styles from "./CreditWorkspace.module.css";

type CreditView = "tiles" | "new-rfq" | "sell-side";

export function CreditWorkspace(): ReactElement {
  const [view, setView] = useState<CreditView>("tiles");

  function handleRfqCreated(): void {
    setView("tiles");
  }

  return (
    <div className={styles.workspace}>
      <div data-testid="credit-nav" className={styles.nav}>
        {(["tiles", "new-rfq", "sell-side"] as const).map((v) => {
          return (
            <button
              key={v}
              type="button"
              data-testid={`credit-tab-${v}`}
              data-active={view === v ? "true" : "false"}
              onClick={(): void => {
                setView(v);
              }}
              className={styles.tab}
            >
              {v === "tiles"
                ? "RFQ Tiles"
                : v === "new-rfq"
                  ? "New RFQ"
                  : "Sell Side"}
            </button>
          );
        })}
      </div>

      {view === "new-rfq" && <NewRfqForm onCreated={handleRfqCreated} />}
      {view === "tiles" && <RfqTilesPanel />}
      {view === "sell-side" && <SellSidePanel />}

      <CreditBlotter />
    </div>
  );
}
