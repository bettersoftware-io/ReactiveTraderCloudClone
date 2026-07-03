import type { EquityInstrument } from "@rtc/domain";

/** Normalised heat intensity for a percentage change: a 10% move = full heat.
 * Verbatim port of the web watchlist/heatmap `Math.min(1, abs(changePct)/10)`. */
export function heat(changePct: number): number {
  return Math.min(1, Math.abs(changePct) / 10);
}

/** Static sector classification used to group instruments visually (from web SectorHeatmap). */
export const SECTOR_MAP: Readonly<Record<string, string>> = {
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

export const DEFAULT_SECTOR = "Other";

export interface SectorGroup {
  readonly sector: string;
  readonly instruments: readonly EquityInstrument[];
}

/** Group instruments by `SECTOR_MAP`, preserving first-seen sector order. */
export function groupBySector(
  instruments: readonly EquityInstrument[],
): readonly SectorGroup[] {
  const bySector = new Map<string, EquityInstrument[]>();

  for (const inst of instruments) {
    const sector = SECTOR_MAP[inst.symbol] ?? DEFAULT_SECTOR;
    const group = bySector.get(sector) ?? [];
    group.push(inst);
    bySector.set(sector, group);
  }

  return [...bySector.entries()].map(([sector, insts]) => {
    return { sector, instruments: insts };
  });
}
