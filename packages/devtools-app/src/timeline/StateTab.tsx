import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import type { InspectorState, MachineRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { StateTreePanel } from "#/panels/StateTreePanel";
import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/ContextPane.module.css";
import {
  changedIds,
  EMPTY_IDS,
  filterStreams,
  machineKey,
  machinesInScope,
  machineValue,
  streamKey,
  streamsInScope,
  streamValue,
} from "#/timeline/scopeState";

/** The State tab's body — the live state tree (or, when `marked`, a pinned
 * reconstruction with ≠-live marks), narrowed to the current scope (spec
 * §3.2). Extracted out of `ContextPane` verbatim; `ContextPane` still decides
 * WHEN this renders (state availability, aged-out/reconstruction-error
 * short-circuits). */
export function StateTab({
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
    ? changedIds(state.streams, presentState.streams, streamKey, streamValue)
    : EMPTY_IDS;

  const changedMachines = marked
    ? changedIds(
        state.machines,
        presentState.machines,
        machineKey,
        machineValue,
      )
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

export interface StateTabProps {
  state: InspectorState;
  presentState: InspectorState;
  marked: boolean;
  scope: Scope;
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
