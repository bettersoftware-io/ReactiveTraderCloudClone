import type { JSX } from "solid-js";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The fx-analytics panel's head slot (PROTO L505): a single, always-active
 * "◉ Analytics" tab — this panel has only one view, so nothing ever toggles
 * it. Reuses the same accent-underline tab chrome as LiveRatesHead and
 * FxBlotterHead (PanelHeadTabs.module.css from #105) so every FX panel head
 * reads as one chrome family. Renders inside the panel header via
 * InhouseLayoutEngine's headRegistry; the collapse/maximize controls stay
 * next to it, owned by the engine, not this component. */
export function AnalyticsHead(): JSX.Element {
  return (
    <div class={styles.headTabs}>
      <span
        data-testid="analytics-head-title"
        data-active="true"
        class={styles.headTab}
      >
        ◉ Analytics
      </span>
    </div>
  );
}
