import { useCallback, useMemo, useState } from "react";
import { matchesCurrencyFilter, type CurrencyCategory } from "@rtc/domain";
import { useCurrencyPairs } from "../hooks/use-currency-pairs";
import { CurrencyFilter } from "./currency-filter";
import { ViewToggle, type ViewMode } from "./view-toggle";
import { Tile } from "./tile/tile";

const STORAGE_KEY = "rtc-view-mode";

function readStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "chart" || stored === "price") return stored;
  } catch {
    // ignore
  }
  return "chart";
}

export function LiveRatesPanel() {
  const pairs = useCurrencyPairs();
  const [filter, setFilter] = useState<CurrencyCategory>("All");
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const filteredPairs = useMemo(
    () => pairs.filter((p) => matchesCurrencyFilter(p.symbol, filter)),
    [pairs, filter],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <CurrencyFilter selected={filter} onChange={setFilter} />
        <ViewToggle mode={viewMode} onChange={handleViewChange} />
      </div>

      {pairs.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          Loading currency pairs...
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 8,
          }}
        >
          {filteredPairs.map((pair) => (
            <Tile
              key={pair.symbol}
              pair={pair}
              showChart={viewMode === "chart"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
