import type { ReactElement } from "react";
import { useState } from "react";

import type {
  DiffEntry,
  InspectorState,
  LogRow,
  MachineRow,
  SerializedValue,
} from "@rtc/devtools-core";
import { diffSerialized, serializeValue } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { formatLogTime } from "#/panels/formatLogTime";
import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/ContextPane.module.css";
import { DiffView } from "#/timeline/DiffView";
import { MachineTab } from "#/timeline/MachineTab";
import { StateTab } from "#/timeline/StateTab";
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
        {pinned && model.selection.mode === "pinned" ? (
          <span data-testid="state-at-seq" className={styles.atSeq}>
            {`@ seq ${model.selection.seq}`}
          </span>
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
