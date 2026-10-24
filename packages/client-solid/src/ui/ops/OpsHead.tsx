import { createMemo, type JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import tabStyles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import styles from "./OpsHead.module.css";

/**
 * The ops-dashboard panel's head slot (PROTO AdminScreen.tsx `.head`): the
 * single, always-active "◈ Observability" tab (this panel has only one view,
 * so nothing ever toggles it) plus a live status pill after the spacer.
 * Reuses the FX/credit heads' chrome (PanelHeadTabs.module.css) so the ops
 * head reads as one chrome family with every other dock. The prototype's pill
 * is a static "ALL SYSTEMS NOMINAL" fake (PROTO never wires an incident);
 * here it reads the SAME `useIncident()` seam IncidentControls drives, so
 * injecting a break-glass incident flips this pill to the alarm state in real
 * time. Renders inside the panel header via InhouseLayoutEngine's
 * headRegistry — the collapse/maximize controls stay next to it, owned by the
 * engine.
 */
export function OpsHead(): JSX.Element {
  const { useIncident } = useViewModel();
  const { state } = useIncident();
  const incidentActive = createMemo((): boolean => {
    return state().active.length > 0;
  });

  return (
    <div class={tabStyles.headTabs}>
      <span
        data-testid="ops-head-title"
        data-active="true"
        class={tabStyles.headTab}
      >
        ◈ Observability
      </span>
      <span class={tabStyles.headSpacer} />
      <span
        data-testid="ops-status-pill"
        data-incident={incidentActive() ? "true" : "false"}
        class={styles.pill}
      >
        {incidentActive() ? "● INCIDENT ACTIVE" : "● ALL SYSTEMS NOMINAL"}
      </span>
    </div>
  );
}
