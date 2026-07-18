import { createMemo, For, type JSX, Show } from "solid-js";

import type { EquityInstrument } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./SectorHeatmap.module.css";

export function SectorHeatmap(props: SectorHeatmapProps): JSX.Element {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();

  const sectors = createMemo(
    (): ReadonlyArray<[string, EquityInstrument[]]> => {
      const bySector = new Map<string, EquityInstrument[]>();

      for (const inst of instruments()) {
        const sector = SECTOR_MAP[inst.symbol] ?? DEFAULT_SECTOR;
        const group = bySector.get(sector) ?? [];
        group.push(inst);
        bySector.set(sector, group);
      }

      return [...bySector.entries()];
    },
  );

  return (
    <Show
      when={instruments().length > 0}
      fallback={<div class={styles.empty}>NO DATA</div>}
    >
      <div class={styles.heatmap}>
        <For each={sectors()}>
          {([sector, insts]: [string, EquityInstrument[]]): JSX.Element => {
            return (
              <div class={styles.sectorRow}>
                <div class={styles.sectorLabel}>{sector.toUpperCase()}</div>
                <div class={styles.cellGrid}>
                  <For each={insts}>
                    {(inst: EquityInstrument): JSX.Element => {
                      return (
                        <HeatCell
                          symbol={inst.symbol}
                          active={inst.symbol === props.selectedSymbol}
                          onSelect={props.onSelect}
                        />
                      );
                    }}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

export interface SectorHeatmapProps {
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

function HeatCell(props: CellProps): JSX.Element {
  const { useEquityQuote } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const quote = useEquityQuote(props.symbol);

  const direction = createMemo((): "up" | "down" => {
    return (quote()?.changePct ?? 0) >= 0 ? "up" : "down";
  });

  const heat = createMemo((): number => {
    return Math.min(1, Math.abs(quote()?.changePct ?? 0) / 10);
  });

  return (
    <button
      type="button"
      data-direction={direction()}
      data-active={props.active ? "true" : "false"}
      data-testid={`heatmap-cell-${props.symbol}`}
      class={styles.cell}
      // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
      style={{ "--heat": heat() }}
      onClick={() => {
        props.onSelect(props.symbol);
      }}
    >
      {props.symbol}
    </button>
  );
}
