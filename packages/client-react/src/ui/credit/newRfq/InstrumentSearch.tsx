import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import type { Instrument } from "@rtc/domain";

import styles from "./InstrumentSearch.module.css";

interface InstrumentSearchProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  onSelect: (instrument: Instrument | null) => void;
}

export function InstrumentSearch({
  instruments,
  selected,
  onSelect,
}: InstrumentSearchProps): ReactElement {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return instruments.filter((i) => {
      return (
        i.name.toLowerCase().includes(q) ||
        i.ticker.toLowerCase().includes(q) ||
        i.cusip.toLowerCase().includes(q)
      );
    });
  }, [instruments, query]);

  const handleSelect = useCallback(
    (instrument: Instrument) => {
      onSelect(instrument);
      setQuery(instrument.name);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Instrument</span>
      {selected ? (
        <div className={styles.selectedInfo}>
          <span className={styles.selectedName}>{selected.name}</span>
          <span className={styles.selectedMeta}>
            CUSIP: {selected.cusip} | Coupon: {selected.interestRate}%
          </span>
          <button
            type="button"
            onClick={(): void => {
              onSelect(null);
              setQuery("");
            }}
            className={styles.changeBtn}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            data-testid="instrument-search-input"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={(): void => {
              setOpen(true);
            }}
            placeholder="Search by ticker, name, or CUSIP..."
            className={styles.searchInput}
          />
          {open && results.length > 0 && (
            <div className={styles.dropdown}>
              {results.map((inst) => {
                return (
                  <button
                    key={inst.id}
                    type="button"
                    data-testid={`instrument-result-${inst.id}`}
                    onClick={(): void => {
                      handleSelect(inst);
                    }}
                    className={styles.resultItem}
                  >
                    <div>{inst.name}</div>
                    <div className={styles.resultCusip}>
                      CUSIP: {inst.cusip}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
