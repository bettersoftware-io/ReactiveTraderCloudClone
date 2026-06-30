import type { CSSProperties, ReactElement } from "react";

import type { EquityInstrument } from "@rtc/domain";

import { useViewModel } from "#/ui/hooks/useViewModel";

import styles from "./SectorHeatmap.module.css";

interface SectorHeatmapProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

/** Static sector classification used to group instruments visually. */
const SECTOR_MAP: Readonly<Record<string, string>> = {
  AAPL: "Technology",
  MSFT: "Technology",
  GOOGL: "Technology",
  META: "Technology",
  NVDA: "Technology",
  AMZN: "Consumer",
  TSLA: "Consumer",
  JPM: "Finance",
  BAC: "Finance",
  GS: "Finance",
  XOM: "Energy",
  CVX: "Energy",
};

const DEFAULT_SECTOR = "Other";

interface CellProps {
  symbol: string;
  active: boolean;
  onSelect: (symbol: string) => void;
}

function HeatCell({ symbol, active, onSelect }: CellProps): ReactElement {
  const { useEquityQuote } = useViewModel();
  const quote = useEquityQuote(symbol);

  const changePct = quote?.changePct ?? 0;
  const direction = changePct >= 0 ? "up" : "down";
  const heat = Math.min(1, Math.abs(changePct) / 10);

  return (
    <button
      type="button"
      data-direction={direction}
      data-active={active ? "true" : "false"}
      data-testid={`heatmap-cell-${symbol}`}
      className={styles.cell}
      // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
      style={{ "--heat": heat } as CSSProperties}
      onClick={() => {
        onSelect(symbol);
      }}
    >
      {symbol}
    </button>
  );
}

export function SectorHeatmap({
  selectedSymbol,
  onSelect,
}: SectorHeatmapProps): ReactElement {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();

  if (instruments.length === 0) {
    return <div className={styles.empty}>NO DATA</div>;
  }

  // Group instruments by sector
  const bySector = new Map<string, EquityInstrument[]>();

  for (const inst of instruments) {
    const sector = SECTOR_MAP[inst.symbol] ?? DEFAULT_SECTOR;
    const group = bySector.get(sector) ?? [];
    group.push(inst);
    bySector.set(sector, group);
  }

  return (
    <div className={styles.heatmap}>
      {[...bySector.entries()].map(([sector, insts]) => {
        return (
          <div key={sector} className={styles.sectorRow}>
            <div className={styles.sectorLabel}>{sector.toUpperCase()}</div>
            <div className={styles.cellGrid}>
              {insts.map((inst) => {
                return (
                  <HeatCell
                    key={inst.symbol}
                    symbol={inst.symbol}
                    active={inst.symbol === selectedSymbol}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
