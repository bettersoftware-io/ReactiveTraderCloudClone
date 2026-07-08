import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import tabStyles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import styles from "./AdminHead.module.css";

/**
 * The admin-dashboard panel's head slot (PROTO AdminScreen.tsx `.head`): the
 * single, always-active "◈ Observability" tab (this panel has only one view,
 * so nothing ever toggles it) plus a live status pill after the spacer.
 * Reuses the FX/credit heads' chrome (PanelHeadTabs.module.css) so the admin
 * head reads as one chrome family with every other dock. The prototype's pill
 * is a static "ALL SYSTEMS NOMINAL" fake (PROTO never wires an incident);
 * here it reads the SAME `useIncident()` seam IncidentControls drives, so
 * injecting a break-glass incident flips this pill to the alarm state in real
 * time. Renders inside the panel header via InhouseLayoutEngine's
 * headRegistry — the collapse/maximize controls stay next to it, owned by the
 * engine.
 */
export function AdminHead(): ReactElement {
  const { useIncident } = useViewModel();
  const { state } = useIncident();
  const incidentActive = state.active.length > 0;

  return (
    <div className={tabStyles.headTabs}>
      <span
        data-testid="admin-head-title"
        data-active="true"
        className={tabStyles.headTab}
      >
        ◈ Observability
      </span>
      <span className={tabStyles.headSpacer} />
      <span
        data-testid="admin-status-pill"
        data-incident={incidentActive ? "true" : "false"}
        className={styles.pill}
      >
        {incidentActive ? "● INCIDENT ACTIVE" : "● ALL SYSTEMS NOMINAL"}
      </span>
    </div>
  );
}
