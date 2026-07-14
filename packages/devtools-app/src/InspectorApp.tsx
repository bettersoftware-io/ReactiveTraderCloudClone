import type { ReactElement } from "react";
import { useState } from "react";

import type { InspectorState, InspectorStore } from "@rtc/devtools-core";

import styles from "#/InspectorApp.module.css";
import { MachinesPanel } from "#/panels/MachinesPanel";
import { StateTreePanel } from "#/panels/StateTreePanel";
import { useInspectorState } from "#/useInspectorState";

/** The devtools panel shell: connection rail + tab strip + active panel.
 * Task 9 wires up the real state-tree and machine-registry panels; Task 10
 * replaces the remaining log/wire placeholders. */
export function InspectorApp({ store }: InspectorAppProps): ReactElement {
  const state = useInspectorState(store);
  const [tab, setTab] = useState<InspectorTab>("state");

  return (
    <div className={styles.app}>
      <ConnectionRail state={state} />
      <div className={styles.main}>
        <TabStrip active={tab} onSelect={setTab} />
        <div className={styles.panel}>
          <TabPanel tab={tab} state={state} />
        </div>
      </div>
    </div>
  );
}

type InspectorTab = "state" | "machines" | "log" | "wire";

export interface InspectorAppProps {
  store: InspectorStore;
}

interface TabDescriptor {
  id: InspectorTab;
  label: string;
}

const TABS: readonly TabDescriptor[] = [
  { id: "state", label: "State" },
  { id: "machines", label: "Machines" },
  { id: "log", label: "Log" },
  { id: "wire", label: "Wire" },
];

const PLACEHOLDER: Record<"log" | "wire", string> = {
  log: "event log — coming in Task 10",
  wire: "raw wire traffic — coming in Task 10",
};

interface ConnectionRailProps {
  state: InspectorState;
}

function ConnectionRail({ state }: ConnectionRailProps): ReactElement {
  const wireCount = state.log.filter((row) => {
    return row.kind === "wire:in" || row.kind === "wire:out";
  }).length;

  return (
    <aside className={styles.rail}>
      <div className={styles.railHeader}>
        <span
          className={
            state.connected ? styles.dotConnected : styles.dotDisconnected
          }
          aria-hidden="true"
        />
        <span data-testid="connection-badge" className={styles.appId}>
          {state.connected ? state.appId : "disconnected"}
        </span>
      </div>
      {state.protocolMismatch !== null ? (
        <p className={styles.mismatch}>
          Protocol mismatch: app v{state.protocolMismatch}
        </p>
      ) : null}
      <dl className={styles.counts}>
        <RailCount label="Streams" value={state.streams.length} />
        <RailCount label="Machines" value={state.machines.length} />
        <RailCount label="Log" value={state.log.length} />
        <RailCount label="Wire" value={wireCount} />
      </dl>
    </aside>
  );
}

interface RailCountProps {
  label: string;
  value: number;
}

function RailCount({ label, value }: RailCountProps): ReactElement {
  return (
    <div className={styles.count}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface TabStripProps {
  active: InspectorTab;
  onSelect: (tab: InspectorTab) => void;
}

function TabStrip({ active, onSelect }: TabStripProps): ReactElement {
  return (
    <nav className={styles.tabs}>
      {TABS.map((t) => {
        return (
          <button
            key={t.id}
            type="button"
            className={t.id === active ? styles.tabActive : styles.tab}
            onClick={() => {
              onSelect(t.id);
            }}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

interface TabPanelProps {
  tab: InspectorTab;
  state: InspectorState;
}

function TabPanel({ tab, state }: TabPanelProps): ReactElement {
  if (tab === "state") {
    return <StateTreePanel streams={state.streams} />;
  }

  if (tab === "machines") {
    return <MachinesPanel machines={state.machines} />;
  }

  return <p className={styles.placeholder}>{PLACEHOLDER[tab]}</p>;
}
