import type { JSX } from "solid-js";
import { For } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./IncidentControls.module.css";

/**
 * Break-glass incident controls. Each inject button reflects whether its kind is
 * currently active via `data-active`; Clear resets all perturbations. Intents
 * come straight from `useIncident()` — the dumb UI holds no state.
 */
export function IncidentControls(): JSX.Element {
  const { useIncident } = useViewModel();
  const { state, inject, clear } = useIncident();

  return (
    <div data-testid="admin-incident-controls" class={styles.controls}>
      <span class={styles.label}>INCIDENTS</span>
      <div class={styles.buttons}>
        <For each={INCIDENTS}>
          {(incident: IncidentCfg) => {
            return (
              <button
                type="button"
                data-testid={`incident-${incident.kind}`}
                data-active={
                  state().active.includes(incident.kind) ? "true" : "false"
                }
                class={styles.inject}
                onClick={() => {
                  inject(incident.kind);
                }}
              >
                {incident.label}
              </button>
            );
          }}
        </For>
        <button
          type="button"
          data-testid="incident-clear"
          data-active={state().active.length === 0 ? "false" : "true"}
          class={styles.clear}
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

// The injectable incident kinds and their break-glass labels. `as const` gives
// the literal union that structurally matches the app-layer IncidentKind, so no
// app-layer type import is needed in the dumb UI.
const INCIDENTS = [
  { kind: "latencySpike", label: "Inject latency spike" },
  { kind: "errorBurst", label: "Inject error burst" },
  { kind: "serviceDown", label: "Inject service down" },
] as const;

type IncidentCfg = (typeof INCIDENTS)[number];
