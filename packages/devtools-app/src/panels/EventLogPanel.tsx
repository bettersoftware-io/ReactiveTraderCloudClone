import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import type { LogRow } from "@rtc/devtools-core";
import { serializeValue } from "@rtc/devtools-core";

import styles from "#/panels/EventLogPanel.module.css";
import { formatLogTime } from "#/panels/formatLogTime";
import { ValueView } from "#/panels/ValueView";

/** The "Log" tab: every devtools event in arrival order, newest at the
 * bottom, gated by a free-text filter (matches `summary`) and per-prefix
 * kind checkboxes. Pausing freezes the RENDERED slice into local state —
 * `log` keeps growing underneath (the store never stops), but the visible
 * rows stay put until unpaused, at which point the view snaps back to the
 * live tail. Each row expands via `<details>` to the full event through the
 * shared `ValueView`. */
export function EventLogPanel({ log }: EventLogPanelProps): ReactElement {
  const [filterText, setFilterText] = useState("");
  const [kinds, setKinds] = useState<KindFilterState>(ALL_KINDS_ON);
  const [paused, setPaused] = useState(false);
  const [frozenRows, setFrozenRows] = useState<readonly LogRow[] | null>(null);

  const liveRows = visibleRows(log, filterText, kinds);
  const rows = paused && frozenRows !== null ? frozenRows : liveRows;

  function togglePause(): void {
    if (paused) {
      setFrozenRows(null);
      setPaused(false);
    } else {
      setFrozenRows(liveRows);
      setPaused(true);
    }
  }

  function toggleKind(prefix: KindPrefix): void {
    setKinds((prev) => {
      return { ...prev, [prefix]: !prev[prefix] };
    });
  }

  function handleFilterChange(e: ChangeEvent<HTMLInputElement>): void {
    setFilterText(e.target.value);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.filterInput}
          placeholder="Filter by summary…"
          value={filterText}
          onChange={handleFilterChange}
        />
        <div className={styles.kindFilters}>
          {KIND_PREFIXES.map((prefix) => {
            return (
              <KindCheckbox
                key={prefix}
                prefix={prefix}
                checked={kinds[prefix]}
                onToggle={toggleKind}
              />
            );
          })}
        </div>
        <button
          type="button"
          className={styles.pauseButton}
          onClick={togglePause}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className={styles.rows}>
        {rows.map((row) => {
          return <LogRowView key={row.seq} row={row} />;
        })}
      </div>
    </div>
  );
}

export interface EventLogPanelProps {
  log: readonly LogRow[];
}

const MAX_RENDERED_ROWS = 500;

const KIND_PREFIXES = ["stream", "machine", "wire", "devtools"] as const;

type KindPrefix = (typeof KIND_PREFIXES)[number];

type KindFilterState = Record<KindPrefix, boolean>;

const ALL_KINDS_ON: KindFilterState = {
  stream: true,
  machine: true,
  wire: true,
  devtools: true,
};

interface KindCheckboxProps {
  prefix: KindPrefix;
  checked: boolean;
  onToggle: (prefix: KindPrefix) => void;
}

function KindCheckbox({
  prefix,
  checked,
  onToggle,
}: KindCheckboxProps): ReactElement {
  return (
    <label className={styles.kindLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          onToggle(prefix);
        }}
      />
      {prefix}
    </label>
  );
}

interface LogRowViewProps {
  row: LogRow;
}

function LogRowView({ row }: LogRowViewProps): ReactElement {
  return (
    <details className={styles.row}>
      <summary className={styles.summary}>
        <span className={styles.time}>{formatLogTime(row.ts)}</span>
        <span className={styles.kindChip}>{row.kind}</span>
        <span className={styles.text}>{row.summary}</span>
      </summary>
      <div className={styles.detail}>
        <ValueView value={serializeValue(row.event)} />
      </div>
    </details>
  );
}

function kindPrefixMatches(
  kind: LogRow["kind"],
  kinds: KindFilterState,
): boolean {
  if (kind.startsWith("stream:")) {
    return kinds.stream;
  }

  if (kind.startsWith("machine:")) {
    return kinds.machine;
  }

  if (kind.startsWith("wire:")) {
    return kinds.wire;
  }

  return kinds.devtools;
}

function visibleRows(
  log: readonly LogRow[],
  filterText: string,
  kinds: KindFilterState,
): readonly LogRow[] {
  const needle = filterText.trim().toLowerCase();

  const filtered = log.filter((row) => {
    if (!kindPrefixMatches(row.kind, kinds)) {
      return false;
    }

    if (needle === "") {
      return true;
    }

    return row.summary.toLowerCase().includes(needle);
  });

  return filtered.slice(-MAX_RENDERED_ROWS);
}
