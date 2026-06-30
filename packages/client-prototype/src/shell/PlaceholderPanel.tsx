import type { ReactElement } from "react";

import type { Tab } from "#/shell/Header/useMenus";
import styles from "#/shell/PlaceholderPanel.module.css";

export interface PlaceholderPanelProps {
  tab: Tab;
}

const PANEL_COPY: Record<Tab, string> = {
  fx: "FX · live rates, exec & blotter — coming in P2",
  credit: "Credit · bond scanner & ladder — coming in P3",
  equities: "Equities · order book & analytics — coming in P4",
  admin: "Admin · HUD terminal & telemetry — coming in P5",
};

export function PlaceholderPanel(props: PlaceholderPanelProps): ReactElement {
  const { tab } = props;
  return (
    <div className={styles.panel} data-testid={`panel-${tab}`}>
      <p className={styles.copy}>{PANEL_COPY[tab]}</p>
    </div>
  );
}
