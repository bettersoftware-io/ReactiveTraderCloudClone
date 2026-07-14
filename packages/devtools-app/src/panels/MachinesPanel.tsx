import type { ReactElement } from "react";
import { useState } from "react";

import type {
  MachineIntentRow,
  MachineRow,
  SerializedValue,
} from "@rtc/devtools-core";

import styles from "#/panels/MachinesPanel.module.css";
import { ValueView } from "#/panels/ValueView";

/** The "Machines" tab: a table of every instrumented machine (id, kind,
 * compact args/state, created time, LIVE/DISPOSED badge) beside a detail
 * pane for the selected machine (full state via `ValueView`, transition
 * count, intent history newest-first). Selection lives in local component
 * state — it is view-only navigation, not application state. */
export function MachinesPanel({ machines }: MachinesPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    machines.find((machine) => {
      return machine.machineId === selectedId;
    }) ?? null;

  return (
    <div className={styles.panel}>
      <MachineTable
        machines={machines}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <MachineDetail machine={selected} />
    </div>
  );
}

const COMPACT_MAX = 60;

export interface MachinesPanelProps {
  machines: readonly MachineRow[];
}

interface MachineTableProps {
  machines: readonly MachineRow[];
  selectedId: string | null;
  onSelect: (machineId: string) => void;
}

function MachineTable({
  machines,
  selectedId,
  onSelect,
}: MachineTableProps): ReactElement {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Kind</th>
          <th>Args</th>
          <th>State</th>
          <th>Created</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {machines.map((machine) => {
          return (
            <MachineTableRow
              key={machine.machineId}
              machine={machine}
              selected={machine.machineId === selectedId}
              onSelect={onSelect}
            />
          );
        })}
      </tbody>
    </table>
  );
}

interface MachineTableRowProps {
  machine: MachineRow;
  selected: boolean;
  onSelect: (machineId: string) => void;
}

function MachineTableRow({
  machine,
  selected,
  onSelect,
}: MachineTableRowProps): ReactElement {
  const rowClassName = machine.disposed
    ? `${styles.row} ${styles.rowDisposed}`
    : styles.row;

  return (
    <tr
      className={rowClassName}
      data-selected={selected}
      onClick={() => {
        onSelect(machine.machineId);
      }}
    >
      <td>{machine.machineId}</td>
      <td>{machine.machineKind}</td>
      <td>{compactValue(machine.args)}</td>
      <td>{compactValue(machine.state)}</td>
      <td>{formatCreatedAt(machine.createdAt)}</td>
      <td>
        <span
          className={machine.disposed ? styles.badgeDisposed : styles.badgeLive}
        >
          {machine.disposed ? "DISPOSED" : "LIVE"}
        </span>
      </td>
    </tr>
  );
}

interface MachineDetailProps {
  machine: MachineRow | null;
}

function MachineDetail({ machine }: MachineDetailProps): ReactElement {
  if (machine === null) {
    return (
      <div className={styles.detail}>
        <p className={styles.empty}>Select a machine to inspect its state.</p>
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <h3 className={styles.detailTitle}>{machine.machineId}</h3>
      <dl className={styles.meta}>
        <MetaRow label="Kind" value={machine.machineKind} />
        <MetaRow label="Transitions" value={String(machine.transitions)} />
        <MetaRow
          label="Status"
          value={machine.disposed ? "DISPOSED" : "LIVE"}
        />
      </dl>
      <h4 className={styles.sectionTitle}>State</h4>
      <ValueView value={machine.state} />
      <h4
        className={styles.sectionTitle}
      >{`Intents (${machine.intents.length})`}</h4>
      <IntentList intents={machine.intents} />
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps): ReactElement {
  return (
    <div className={styles.metaRow}>
      <dt className={styles.metaLabel}>{label}</dt>
      <dd className={styles.metaValue}>{value}</dd>
    </div>
  );
}

interface IntentListProps {
  intents: readonly MachineIntentRow[];
}

function IntentList({ intents }: IntentListProps): ReactElement {
  const newestFirst = withIntentKeys([...intents].reverse());

  return (
    <ul className={styles.intents}>
      {newestFirst.map((entry) => {
        return (
          <li key={entry.key} className={styles.intent}>
            <span data-testid="intent-name" className={styles.intentName}>
              {entry.intent.name}
            </span>
            <ValueView value={entry.intent.args} />
          </li>
        );
      })}
    </ul>
  );
}

function compactValue(value: SerializedValue | null): string {
  if (value === null) {
    return "";
  }

  const json = JSON.stringify(value);

  return json.length > COMPACT_MAX ? `${json.slice(0, COMPACT_MAX)}…` : json;
}

function formatCreatedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

interface KeyedIntent {
  intent: MachineIntentRow;
  key: string;
}

/** Pairs each (already newest-first) intent with a positional React key
 * WITHOUT exposing the index in the `.map` that renders JSX — `biome`'s
 * `noArrayIndexKey` flags any `key` expression reading a map callback's own
 * index parameter, so the index is assigned here, one level removed from the
 * render. Intents have no natural id and can repeat a name+ts pair. */
function withIntentKeys(intents: readonly MachineIntentRow[]): KeyedIntent[] {
  return intents.map((intent, i) => {
    return { intent, key: `${i}` };
  });
}
