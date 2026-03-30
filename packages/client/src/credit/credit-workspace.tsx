import { useCallback, useState } from "react";
import { NewRfqForm } from "./new-rfq/new-rfq-form";
import { RfqTilesPanel } from "./rfq-tiles/rfq-tiles-panel";
import { CreditBlotter } from "./blotter/credit-blotter";
import { SellSidePanel } from "./sell-side/sell-side-panel";

type CreditView = "tiles" | "new-rfq" | "sell-side";

export function CreditWorkspace() {
  const [view, setView] = useState<CreditView>("tiles");

  const handleRfqCreated = useCallback(() => {
    setView("tiles");
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      <div data-testid="credit-nav" style={{ display: "flex", gap: 4 }}>
        {(["tiles", "new-rfq", "sell-side"] as const).map((v) => (
          <button
            key={v}
            data-testid={`credit-tab-${v}`}
            onClick={() => setView(v)}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontWeight: view === v ? 600 : 400,
              backgroundColor: view === v ? "var(--accent-primary)" : "transparent",
              color: view === v ? "#fff" : "var(--text-secondary)",
            }}
          >
            {v === "tiles" ? "RFQ Tiles" : v === "new-rfq" ? "New RFQ" : "Sell Side"}
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
