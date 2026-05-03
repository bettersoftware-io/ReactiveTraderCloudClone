import { useMemo, useState, useCallback } from "react";
import type { Instrument } from "@rtc/domain";

interface InstrumentSearchProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  onSelect: (instrument: Instrument) => void;
}

export function InstrumentSearch({ instruments, selected, onSelect }: InstrumentSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return instruments.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.ticker.toLowerCase().includes(q) ||
        i.cusip.toLowerCase().includes(q),
    );
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
    <div style={{ position: "relative" }}>
      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
        Instrument
      </label>
      {selected ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {selected.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            CUSIP: {selected.cusip} | Coupon: {selected.interestRate}%
          </span>
          <button
            onClick={() => { onSelect(null!); setQuery(""); }}
            style={{ alignSelf: "flex-start", fontSize: 10, color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by ticker, name, or CUSIP..."
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              border: "1px solid var(--border-primary)",
              borderRadius: 3,
              backgroundColor: "transparent",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          {open && results.length > 0 && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 10,
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              borderRadius: 4,
              maxHeight: 200,
              overflow: "auto",
            }}>
              {results.map((inst) => (
                <div
                  key={inst.id}
                  onClick={() => handleSelect(inst)}
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div>{inst.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    CUSIP: {inst.cusip}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
