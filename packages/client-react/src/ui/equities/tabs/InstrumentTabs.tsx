import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./InstrumentTabs.module.css";

export function InstrumentTabs({
  selectedSymbol,
  onSelect,
}: InstrumentTabsProps): ReactElement {
  const { useWatchlist } = useViewModel();
  const instruments = useWatchlist();

  return (
    <nav className={styles.tabs} aria-label="Instrument tabs">
      {instruments.map((inst) => {
        const active = inst.symbol === selectedSymbol;
        return (
          <button
            key={inst.symbol}
            type="button"
            data-active={active ? "true" : "false"}
            data-testid={`instrument-tab-${inst.symbol}`}
            className={styles.tab}
            onClick={() => {
              onSelect(inst.symbol);
            }}
          >
            {inst.symbol}
          </button>
        );
      })}
    </nav>
  );
}

interface InstrumentTabsProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}
