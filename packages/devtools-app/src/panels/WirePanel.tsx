import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import type { DevtoolsEvent, LogRow } from "@rtc/devtools-core";
import { serializeValue } from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import { ValueView } from "#/panels/ValueView";
import styles from "#/panels/WirePanel.module.css";

/** The "Wire" tab: `log` filtered to `wire:in`/`wire:out` events only — the
 * SAME store the "Log" tab reads, never a second data path. Adds a msgType
 * free-text filter, a per-msgType count strip (unaffected by that filter,
 * so it always reads as "traffic so far"), and a direction indicator per
 * row (`▲ out` / `▼ in`). The simulator branch never wraps a WS adapter
 * (Task 7), so an empty wire log is the normal dev-mode state — shown as an
 * explicit empty-state message rather than an empty table. */
export function WirePanel({ log }: WirePanelProps): ReactElement {
  const [filterText, setFilterText] = useState("");

  const wireRows = wireRowsOf(log);

  if (wireRows.length === 0) {
    return (
      <div className={styles.panel}>
        <p className={styles.empty}>{EMPTY_STATE_TEXT}</p>
      </div>
    );
  }

  const needle = filterText.trim().toLowerCase();
  const filtered = wireRows.filter((row) => {
    return needle === "" || row.event.msgType.toLowerCase().includes(needle);
  });

  function handleFilterChange(e: ChangeEvent<HTMLInputElement>): void {
    setFilterText(e.target.value);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.filterInput}
          placeholder="Filter by msgType…"
          value={filterText}
          onChange={handleFilterChange}
        />
      </div>
      <CountStrip counts={countByMsgType(wireRows)} />
      <div className={styles.rows}>
        {filtered.map((row) => {
          return <WireRowView key={row.seq} row={row} />;
        })}
      </div>
    </div>
  );
}

export interface WirePanelProps {
  log: readonly LogRow[];
}

const EMPTY_STATE_TEXT =
  "No wire traffic — the app is running on in-process simulators (no WebSocket).";

interface WireKindFilter {
  kind: "wire:in" | "wire:out";
}

type WireEvent = Extract<DevtoolsEvent, WireKindFilter>;

interface WireRow extends LogRow {
  event: WireEvent;
}

interface CountStripProps {
  counts: ReadonlyMap<string, number>;
}

function CountStrip({ counts }: CountStripProps): ReactElement {
  return (
    <div className={styles.countStrip}>
      {[...counts.entries()].map(([msgType, count]) => {
        return (
          <span key={msgType} className={styles.countChip}>
            {`${msgType}: ${count}`}
          </span>
        );
      })}
    </div>
  );
}

interface WireRowViewProps {
  row: WireRow;
}

function WireRowView({ row }: WireRowViewProps): ReactElement {
  const direction = row.event.kind === "wire:out" ? "▲ out" : "▼ in";
  const directionClassName =
    row.event.kind === "wire:out" ? styles.directionOut : styles.directionIn;

  return (
    <details className={styles.row}>
      <summary className={styles.summary}>
        <span className={directionClassName}>{direction}</span>
        <span className={styles.time}>{formatLogTime(row.ts)}</span>
        <span className={styles.msgType}>{row.event.msgType}</span>
        <span className={styles.text}>{row.summary}</span>
      </summary>
      <div className={styles.detail}>
        <ValueView value={serializeValue(row.event)} />
      </div>
    </details>
  );
}

function isWireRow(row: LogRow): row is WireRow {
  return row.kind === "wire:in" || row.kind === "wire:out";
}

function wireRowsOf(log: readonly LogRow[]): WireRow[] {
  return log.filter(isWireRow);
}

function countByMsgType(rows: readonly WireRow[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const msgType = row.event.msgType;
    counts.set(msgType, (counts.get(msgType) ?? 0) + 1);
  }

  return counts;
}
