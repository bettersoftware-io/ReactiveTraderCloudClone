import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import type {
  DiffEntry,
  InspectorState,
  LogRow,
  MachineRow,
  SerializedValue,
  StreamRow,
} from "@rtc/devtools-core";
import { diffSerialized, serializeValue } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { parseStreamId } from "#/nav/scope";
import { formatLogTime } from "#/panels/formatLogTime";
import { StateTreePanel } from "#/panels/StateTreePanel";
import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/ContextPane.module.css";
import { DiffView } from "#/timeline/DiffView";
import { MachineTab } from "#/timeline/MachineTab";
import { diffableValueOf, findPredecessorRow } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** The right pane. Following: the live state tree (the old State tab, one
 * glance away). Pinned: Redux's trio for the selected event — Event payload,
 * the whole reconstructed State at that seq (with ≠-live marks), and the Diff
 * vs the previous value of the same source. Reconstruction/diff failures
 * render an inline error card, never a blank pane. State narrows to the
 * current scope (spec §3.2); a fourth Machine tab appears whenever a context
 * machine exists — the scoped machine, or the pinned row's. */
export function ContextPane({
  model,
  log,
  presentState,
  scope,
  dev,
  onInvokeIntent,
  onPinIntent,
}: ContextPaneProps): ReactElement {
  const [tab, setTab] = useState<ContextTab>("state");
  const pinned = model.selection.mode === "pinned";
  const row = model.selectedRow;
  const contextMachine = findContextMachine(presentState, scope, row);
  const stateAvailable = scope.kind !== "wire" && scope.kind !== "msgType";
  // Tabs that need a pinned row fall back to State while following; a
  // Machine tab left selected after its machine went away falls back too.
  const activeTab = resolveTab(tab, pinned, contextMachine !== null);

  return (
    <div className={styles.pane}>
      <nav className={styles.tabs}>
        <TabButton
          tabId="event"
          active={activeTab}
          disabled={!pinned}
          onSelect={setTab}
        />
        <TabButton
          tabId="state"
          active={activeTab}
          disabled={!stateAvailable}
          onSelect={setTab}
        />
        <TabButton
          tabId="diff"
          active={activeTab}
          disabled={!pinned}
          onSelect={setTab}
        />
        {contextMachine !== null ? (
          <TabButton
            tabId="machine"
            active={activeTab}
            disabled={false}
            onSelect={setTab}
          />
        ) : null}
      </nav>
      <div className={styles.body}>
        {activeTab === "machine" && contextMachine !== null ? (
          <MachineTab
            machine={contextMachine}
            dev={dev}
            onInvokeIntent={onInvokeIntent}
            onPinIntent={onPinIntent}
          />
        ) : (
          <ContextBody
            tab={activeTab}
            model={model}
            row={row}
            log={log}
            presentState={presentState}
            scope={scope}
            stateAvailable={stateAvailable}
          />
        )}
      </div>
    </div>
  );
}

export interface ContextPaneProps {
  model: TimelineModel;
  log: readonly LogRow[];
  presentState: InspectorState;
  scope: Scope;
  dev: boolean;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
  onPinIntent?: (machineId: string, name: string, ts: number) => void;
}

type ContextTab = "event" | "state" | "diff" | "machine";

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
  machine: "Machine",
};

function TabButton({
  tabId,
  active,
  disabled,
  onSelect,
}: TabButtonProps): ReactElement {
  function selectContextTab(): void {
    onSelect(tabId);
  }

  return (
    <button
      type="button"
      data-testid={`context-tab-${tabId}`}
      disabled={disabled}
      className={tabId === active ? styles.tabActive : styles.tab}
      onClick={selectContextTab}
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
  scope: Scope;
  stateAvailable: boolean;
}

function ContextBody({
  tab,
  model,
  row,
  log,
  presentState,
  scope,
  stateAvailable,
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

  if (tab === "state" && !stateAvailable) {
    return <div className={styles.noState}>wire messages carry no state</div>;
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
      scope={scope}
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

  const outcome = diffAgainstPredecessor(current, row, log);

  if (outcome.kind === "error") {
    return <ErrorCard message={`Diff failed: ${outcome.message}`} />;
  }

  if (outcome.kind === "noPrior") {
    return <DiffView entries={[]} noPrior={true} />;
  }

  return <DiffView entries={outcome.entries} noPrior={false} />;
}

// The computation, not the JSX, is what can throw (`findPredecessorRow` /
// `diffableValueOf` / `diffSerialized`) — react-hooks/error-boundaries is
// right that a render error inside a try/catch escapes the catch, since React
// doesn't construct the element until later. Hoisting the try/catch out of
// JSX-construction keeps the SAME calls guarded while satisfying the rule:
// this function returns a result the caller branches on, and only the caller
// builds JSX.
type DiffOutcome =
  | { kind: "noPrior" }
  | { kind: "entries"; entries: readonly DiffEntry[] }
  | { kind: "error"; message: string };

function diffAgainstPredecessor(
  current: SerializedValue,
  row: LogRow,
  log: readonly LogRow[],
): DiffOutcome {
  try {
    const predecessor = findPredecessorRow(log, row);
    const previous =
      predecessor === null ? null : diffableValueOf(predecessor.event);

    if (previous === null) {
      return { kind: "noPrior" };
    }

    return { kind: "entries", entries: diffSerialized(previous, current) };
  } catch (error) {
    return { kind: "error", message: String(error) };
  }
}

interface StateTabProps {
  state: InspectorState;
  presentState: InspectorState;
  marked: boolean;
  scope: Scope;
}

function StateTab({
  state,
  presentState,
  marked,
  scope,
}: StateTabProps): ReactElement {
  const [query, setQuery] = useState("");
  const searchable = scope.kind === "all" || scope.kind === "presenter";
  const showStreams =
    scope.kind === "all" ||
    scope.kind === "presenter" ||
    scope.kind === "stream";

  const showMachines =
    scope.kind === "all" ||
    scope.kind === "machineKind" ||
    scope.kind === "machine";

  function changeStateQuery(e: ChangeEvent<HTMLInputElement>): void {
    setQuery(e.target.value);
  }

  const changedStreams = marked
    ? changedStreamIds(state.streams, presentState.streams)
    : EMPTY_IDS;

  const changedMachines = marked
    ? changedMachineIds(state.machines, presentState.machines)
    : EMPTY_IDS;

  const streams = filterStreams(
    streamsInScope(state.streams, scope),
    searchable ? query : "",
  );
  const machines = machinesInScope(state.machines, scope);
  const focused = scope.kind === "machine" ? (machines[0] ?? null) : null;

  return (
    <div className={styles.stateTab}>
      {searchable ? (
        <input
          type="text"
          className={styles.search}
          placeholder="Search state…"
          value={query}
          onChange={changeStateQuery}
        />
      ) : null}
      {showStreams ? (
        <StateTreePanel streams={streams} changedIds={changedStreams} />
      ) : null}
      {showMachines ? (
        <>
          <h3 className={styles.machinesTitle}>Machines</h3>
          <div className={styles.machines}>
            {machines.map((machine) => {
              return (
                <MachineLine
                  key={machine.machineId}
                  machine={machine}
                  changed={changedMachines.has(machine.machineId)}
                />
              );
            })}
          </div>
        </>
      ) : null}
      {focused !== null ? <ValueView value={focused.state} /> : null}
    </div>
  );
}

interface MachineLineProps {
  machine: MachineRow;
  changed: boolean;
}

function MachineLine({ machine, changed }: MachineLineProps): ReactElement {
  const stateJson = JSON.stringify(machine.state) ?? "null";
  const compact =
    stateJson.length > 60 ? `${stateJson.slice(0, 60)}…` : stateJson;

  return (
    <div data-testid="devtools-machine-row" className={styles.machineLine}>
      <span className={styles.machineId}>{machine.machineId}</span>
      <span className={styles.machineKind}>{machine.machineKind}</span>
      <span className={styles.machineState}>{compact}</span>
      {changed ? (
        <span className={styles.changedMark} title="differs from live">
          ≠ live
        </span>
      ) : null}
    </div>
  );
}

interface ErrorCardProps {
  message: string;
}

function ErrorCard({ message }: ErrorCardProps): ReactElement {
  return <div className={styles.errorCard}>{`⚠ ${message}`}</div>;
}

function resolveTab(
  tab: ContextTab,
  pinned: boolean,
  hasMachine: boolean,
): ContextTab {
  if (tab === "machine") {
    return hasMachine ? "machine" : "state";
  }

  return pinned ? tab : "state";
}

/** The machine the Machine tab describes: the scoped one, else the pinned
 * row's. Always the LIVE row (intent history + injector are live concerns);
 * the State tab is where the pinned reconstruction shows. */
function findContextMachine(
  state: InspectorState,
  scope: Scope,
  row: LogRow | null,
): MachineRow | null {
  const machineId =
    scope.kind === "machine"
      ? scope.machineId
      : row !== null && "machineId" in row.event
        ? row.event.machineId
        : null;

  if (machineId === null) {
    return null;
  }

  return (
    state.machines.find((machine) => {
      return machine.machineId === machineId;
    }) ?? null
  );
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

function streamsInScope(
  streams: readonly StreamRow[],
  scope: Scope,
): readonly StreamRow[] {
  if (scope.kind === "presenter") {
    return streams.filter((row) => {
      return parseStreamId(row.streamId).presenter === scope.presenter;
    });
  }

  if (scope.kind === "stream") {
    return streams.filter((row) => {
      return row.streamId === scope.streamId;
    });
  }

  return streams;
}

function machinesInScope(
  machines: readonly MachineRow[],
  scope: Scope,
): readonly MachineRow[] {
  if (scope.kind === "machineKind") {
    return machines.filter((row) => {
      return row.machineKind === scope.machineKind;
    });
  }

  if (scope.kind === "machine") {
    return machines.filter((row) => {
      return row.machineId === scope.machineId;
    });
  }

  return machines;
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

function changedMachineIds(
  pinned: readonly MachineRow[],
  live: readonly MachineRow[],
): ReadonlySet<string> {
  const liveById = new Map(
    live.map((row) => {
      return [row.machineId, row] as const;
    }),
  );
  const changed = new Set<string>();

  for (const row of pinned) {
    const liveRow = liveById.get(row.machineId);

    if (
      liveRow === undefined ||
      JSON.stringify(liveRow.state) !== JSON.stringify(row.state)
    ) {
      changed.add(row.machineId);
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
