import type { ChangeEvent, ReactElement } from "react";
import { useMemo, useState } from "react";

import type {
  InspectorState,
  LogRow,
  MachineRow,
  StreamRow,
} from "@rtc/devtools-core";
import { diffSerialized, serializeValue } from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import { StateTreePanel } from "#/panels/StateTreePanel";
import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/ContextPane.module.css";
import { DiffView } from "#/timeline/DiffView";
import { diffableValueOf, findPredecessorRow } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** The right pane. Following: the live state tree (the old State tab, one
 * glance away). Pinned: Redux's trio for the selected event — Event payload,
 * the whole reconstructed State at that seq (with ≠-live marks), and the Diff
 * vs the previous value of the same source. Reconstruction/diff failures
 * render an inline error card, never a blank pane. */
export function ContextPane({
  model,
  log,
  presentState,
}: ContextPaneProps): ReactElement {
  const [tab, setTab] = useState<ContextTab>("state");
  const pinned = model.selection.mode === "pinned";
  const row = model.selectedRow;

  return (
    <div className={styles.pane}>
      <nav className={styles.tabs}>
        <TabButton
          tabId="event"
          active={tab}
          disabled={!pinned}
          onSelect={setTab}
        />
        <TabButton
          tabId="state"
          active={tab}
          disabled={false}
          onSelect={setTab}
        />
        <TabButton
          tabId="diff"
          active={tab}
          disabled={!pinned}
          onSelect={setTab}
        />
      </nav>
      <div className={styles.body}>
        <ContextBody
          tab={pinned ? tab : "state"}
          model={model}
          row={row}
          log={log}
          presentState={presentState}
        />
      </div>
    </div>
  );
}

type ContextTab = "event" | "state" | "diff";

export interface ContextPaneProps {
  model: TimelineModel;
  log: readonly LogRow[];
  presentState: InspectorState;
}

interface TabButtonProps {
  tabId: ContextTab;
  active: ContextTab;
  disabled: boolean;
  onSelect: (tab: ContextTab) => void;
}

const TAB_LABELS: Record<ContextTab, string> = {
  event: "Event",
  state: "State",
  diff: "Diff",
};

function TabButton({
  tabId,
  active,
  disabled,
  onSelect,
}: TabButtonProps): ReactElement {
  function handleClick(): void {
    onSelect(tabId);
  }

  return (
    <button
      type="button"
      data-testid={`context-tab-${tabId}`}
      disabled={disabled}
      className={tabId === active ? styles.tabActive : styles.tab}
      onClick={handleClick}
    >
      {TAB_LABELS[tabId]}
    </button>
  );
}

interface ContextBodyProps {
  tab: ContextTab;
  model: TimelineModel;
  row: LogRow | null;
  log: readonly LogRow[];
  presentState: InspectorState;
}

function ContextBody({
  tab,
  model,
  row,
  log,
  presentState,
}: ContextBodyProps): ReactElement {
  if (model.agedOut) {
    return (
      <ErrorCard message="This moment left the rolling buffer — Resume to return to live." />
    );
  }

  if (model.reconstructError !== null) {
    return (
      <ErrorCard
        message={`State reconstruction failed: ${model.reconstructError}`}
      />
    );
  }

  if (tab === "event" && row !== null) {
    return <EventTab row={row} />;
  }

  if (tab === "diff" && row !== null) {
    return <DiffTab row={row} log={log} />;
  }

  const state =
    model.selection.mode === "pinned" && model.pinnedState !== null
      ? model.pinnedState
      : presentState;

  return (
    <StateTab
      state={state}
      presentState={presentState}
      marked={model.selection.mode === "pinned"}
    />
  );
}

interface EventTabProps {
  row: LogRow;
}

function EventTab({ row }: EventTabProps): ReactElement {
  return (
    <div className={styles.eventTab}>
      <dl className={styles.meta}>
        <dt>kind</dt>
        <dd>{row.kind}</dd>
        <dt>seq</dt>
        <dd>{row.seq}</dd>
        <dt>time</dt>
        <dd>{formatLogTime(row.ts)}</dd>
        {"coalesced" in row.event ? (
          <>
            <dt>coalesced</dt>
            <dd>{`×${row.event.coalesced}`}</dd>
          </>
        ) : null}
      </dl>
      <ValueView value={serializeValue(row.event)} />
    </div>
  );
}

interface DiffTabProps {
  row: LogRow;
  log: readonly LogRow[];
}

function DiffTab({ row, log }: DiffTabProps): ReactElement {
  const current = diffableValueOf(row.event);

  if (current === null) {
    return <DiffView entries={[]} noPrior={true} />;
  }

  try {
    const predecessor = findPredecessorRow(log, row);
    const previous =
      predecessor === null ? null : diffableValueOf(predecessor.event);

    if (previous === null) {
      return <DiffView entries={[]} noPrior={true} />;
    }

    return (
      <DiffView entries={diffSerialized(previous, current)} noPrior={false} />
    );
  } catch (error) {
    return <ErrorCard message={`Diff failed: ${String(error)}`} />;
  }
}

interface StateTabProps {
  state: InspectorState;
  presentState: InspectorState;
  marked: boolean;
}

function StateTab({
  state,
  presentState,
  marked,
}: StateTabProps): ReactElement {
  const [query, setQuery] = useState("");

  const changedIds = useMemo((): ReadonlySet<string> => {
    if (!marked) {
      return new Set();
    }

    return changedStreamIds(state.streams, presentState.streams);
  }, [marked, state, presentState]);

  const visibleStreams = useMemo(() => {
    return filterStreams(state.streams, query);
  }, [state, query]);

  function handleQuery(e: ChangeEvent<HTMLInputElement>): void {
    setQuery(e.target.value);
  }

  return (
    <div className={styles.stateTab}>
      <input
        type="text"
        className={styles.search}
        placeholder="Search state…"
        value={query}
        onChange={handleQuery}
      />
      <StateTreePanel streams={visibleStreams} changedIds={changedIds} />
      <h3 className={styles.machinesTitle}>Machines</h3>
      <div className={styles.machines}>
        {state.machines.map((machine) => {
          return <MachineLine key={machine.machineId} machine={machine} />;
        })}
      </div>
    </div>
  );
}

interface MachineLineProps {
  machine: MachineRow;
}

function MachineLine({ machine }: MachineLineProps): ReactElement {
  const stateJson = JSON.stringify(machine.state) ?? "null";
  const compact =
    stateJson.length > 60 ? `${stateJson.slice(0, 60)}…` : stateJson;

  return (
    <div className={styles.machineLine}>
      <span className={styles.machineId}>{machine.machineId}</span>
      <span className={styles.machineKind}>{machine.machineKind}</span>
      <span className={styles.machineState}>{compact}</span>
    </div>
  );
}

interface ErrorCardProps {
  message: string;
}

function ErrorCard({ message }: ErrorCardProps): ReactElement {
  return <div className={styles.errorCard}>{`⚠ ${message}`}</div>;
}

function changedStreamIds(
  pinned: readonly StreamRow[],
  live: readonly StreamRow[],
): ReadonlySet<string> {
  const liveById = new Map(
    live.map((row) => {
      return [row.streamId, row] as const;
    }),
  );
  const changed = new Set<string>();

  for (const row of pinned) {
    const liveRow = liveById.get(row.streamId);

    if (
      liveRow === undefined ||
      JSON.stringify(liveRow.lastValue) !== JSON.stringify(row.lastValue)
    ) {
      changed.add(row.streamId);
    }
  }

  return changed;
}

function filterStreams(
  streams: readonly StreamRow[],
  query: string,
): readonly StreamRow[] {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return streams;
  }

  return streams.filter((row) => {
    if (row.streamId.toLowerCase().includes(needle)) {
      return true;
    }

    return (JSON.stringify(row.lastValue) ?? "").toLowerCase().includes(needle);
  });
}
