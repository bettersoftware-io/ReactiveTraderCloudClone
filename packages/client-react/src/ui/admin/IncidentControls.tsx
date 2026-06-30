import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./IncidentControls.module.css";

// The injectable incident kinds and their break-glass labels. `as const` gives
// the literal union that structurally matches the app-layer IncidentKind, so no
// app-layer type import is needed in the dumb UI.
const INCIDENTS = [
  { kind: "latencySpike", label: "Inject latency spike" },
  { kind: "errorBurst", label: "Inject error burst" },
  { kind: "serviceDown", label: "Inject service down" },
] as const;

/**
 * Break-glass incident controls. Each inject button reflects whether its kind is
 * currently active via `data-active`; Clear resets all perturbations. Intents
 * come straight from `useIncident()` — the dumb UI holds no state.
 */
export function IncidentControls(): ReactElement {
  const { useIncident } = useViewModel();
  const { state, inject, clear } = useIncident();

  return (
    <div data-testid="admin-incident-controls" className={styles.controls}>
      <span className={styles.label}>INCIDENTS</span>
      <div className={styles.buttons}>
        {INCIDENTS.map((incident) => {
          const active = state.active.includes(incident.kind);
          return (
            <button
              key={incident.kind}
              type="button"
              data-testid={`incident-${incident.kind}`}
              data-active={active ? "true" : "false"}
              className={styles.inject}
              onClick={() => {
                inject(incident.kind);
              }}
            >
              {incident.label}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="incident-clear"
          data-active={state.active.length === 0 ? "false" : "true"}
          className={styles.clear}
          onClick={() => {
            clear();
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
