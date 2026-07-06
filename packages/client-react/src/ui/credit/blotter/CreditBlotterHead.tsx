import type { ReactElement } from "react";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The credit-blotter panel's head slot: a single, always-active
 * "▤ Credit Blotter" tab — this panel has only one view, so nothing ever
 * toggles it. Reuses the same accent-underline tab chrome as the FX panel
 * heads (PanelHeadTabs.module.css from #105) so the credit dock's heads read
 * as one chrome family with FX. Renders inside the panel header via
 * InhouseLayoutEngine's headRegistry; the collapse/maximize controls stay
 * next to it, owned by the engine, not this component. */
export function CreditBlotterHead(): ReactElement {
  return (
    <div className={styles.headTabs}>
      <span
        data-testid="credit-blotter-head-title"
        data-active="true"
        className={styles.headTab}
      >
        ▤ Credit Blotter
      </span>
    </div>
  );
}
