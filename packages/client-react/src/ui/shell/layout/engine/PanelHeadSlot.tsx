import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's LEFT half: the panel's registered head slot (FX's Live
 * Rates ▸ Watchlist tabs + CHARTS chip) or, absent one, its title rendered
 * as a single accent tab. Shared by both layout engines — the in-house
 * engine renders it inside its `.panelHeader`; the dockview engine portals
 * it into dockview's tab (its drag surface) — so a panel's header is the
 * same nodes whichever engine is on. */
export function PanelHeadSlot({
  panelId,
  title,
  headContent,
}: PanelHeadSlotProps): ReactElement {
  if (headContent) {
    return <div className={styles.panelHeadContent}>{headContent()}</div>;
  }

  return (
    <span data-testid={`panel-${panelId}-title`} className={styles.panelTitle}>
      {title}
    </span>
  );
}

export interface PanelHeadSlotProps {
  panelId: PanelId;
  title: string;
  /** The panel's entry in the head registry, when it has one. */
  headContent?: () => ReactElement;
}
