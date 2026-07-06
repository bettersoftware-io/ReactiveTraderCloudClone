import type { ReactElement } from "react";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The Order Ticket panel's head slot: a static "✚ Order Ticket" title — no
 * tabs or controls (unlike LiveRatesHead/FxBlotterHead, the ticket has no
 * alternate view to switch between). Mirrors the prototype's dock Panel head
 * glyph (Ticket/OrderTicketPanel usage in EquitiesScreen.tsx: "✚ Order
 * Ticket"). Renders inside the panel header via InhouseLayoutEngine's
 * headRegistry. */
export function EqTicketHead(): ReactElement {
  return (
    <div className={styles.headTabs}>
      <span className={styles.headTab} data-active="true">
        ✚ Order Ticket
      </span>
    </div>
  );
}
