import type { ReactElement } from "react";

import type { JarvisPanelVm, PanelData } from "@rtc/client-core";

import { PanelGauge } from "./PanelGauge";
import { PanelHeatmap } from "./PanelHeatmap";
import { PanelLine } from "./PanelLine";
import { PanelSparkGrid } from "./PanelSparkGrid";
import { PanelTable } from "./PanelTable";

import styles from "./JarvisPanelLayer.module.css";

/**
 * The unsupported/pending/per-viz-kind switch shared by every desk-panel
 * chrome: `JarvisPanelLayer`'s floating `JarvisPanelCard` and
 * `JarvisDockedPanelBody` (a docked panel's leaf inside the workspace
 * engine) both render this same component, so a spec edit ("make it a
 * table") restyles a panel identically whether it's floating or docked.
 * Extracted to its own file (rather than staying local to
 * `JarvisPanelLayer.tsx`) so both callers can import it without that file
 * exporting a second component (`rtc/component-newspaper`).
 */
export function JarvisPanelBody({
  panel,
  data,
}: JarvisPanelBodyProps): ReactElement {
  if (panel.status === "unsupported") {
    return (
      <div
        data-testid="jarvis-panel-unsupported"
        className={styles.unsupported}
      >
        <div className={styles.unsupportedTitle}>UNSUPPORTED PANEL</div>
        <div className={styles.unsupportedText}>
          This build has no renderer for what J.A.R.V.I.S proposed.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className={styles.pending}>Connecting…</div>;
  }

  switch (data.kind) {
    case "line":
      return <PanelLine {...data} />;
    case "table":
      return <PanelTable {...data} />;
    case "gauge":
      return <PanelGauge {...data} />;
    case "sparkGrid":
      return <PanelSparkGrid {...data} />;
    case "heatmap":
      return <PanelHeatmap {...data} />;

    default: {
      const _exhaustive: never = data;
      return _exhaustive;
    }
  }
}

interface JarvisPanelBodyProps {
  panel: JarvisPanelVm;
  data: PanelData | null;
}
