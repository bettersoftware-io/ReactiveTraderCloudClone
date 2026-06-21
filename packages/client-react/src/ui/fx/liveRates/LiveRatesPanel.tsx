import { useMemo, useState } from "react";
import { matchesCurrencyFilter, type CurrencyCategory } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import { CurrencyFilter } from "./CurrencyFilter";
import { ViewToggle } from "./ViewToggle";
import { Tile } from "./tile/Tile";

export function LiveRatesPanel() {
  const hooks = useHooks();
  const pairs = hooks.useCurrencyPairs();
  // ViewMode persistence lives behind the seam (PreferencesPort). The category
  // filter stays local — it's transient view state, not a persisted preference.
  const { viewMode, setViewMode } = hooks.useViewModePreference();
  const [filter, setFilter] = useState<CurrencyCategory>("All");

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
        <ViewToggle mode={viewMode} onChange={setViewMode} />
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
