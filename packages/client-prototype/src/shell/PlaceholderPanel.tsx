import type { ReactElement } from "react";

import type { Tab } from "#/shell/Header/useMenus";
import styles from "#/shell/PlaceholderPanel.module.css";

export interface PlaceholderPanelProps {
  tab: Tab;
}

// `fx` is now rendered by FxScreen (see AppShell) rather than through here.
const PANEL_COPY: Record<Exclude<Tab, "fx">, string> = {
  credit: "Credit · bond scanner & ladder — coming in P3",
  equities: "Equities · order book & analytics — coming in P4",
  admin: "Admin · HUD terminal & telemetry — coming in P5",
};

export function PlaceholderPanel(props: PlaceholderPanelProps): ReactElement {
  const { tab } = props;

  // AppShell never routes "fx" here, but the prop stays the full `Tab` type
  // rather than reaching for a cast — this guard narrows it for PANEL_COPY.
  if (tab === "fx") {
    return <div className={styles.panel} data-testid="panel-fx" />;
  }

  return (
    <div className={styles.panel} data-testid={`panel-${tab}`}>
      <p className={styles.copy}>{PANEL_COPY[tab]}</p>
    </div>
  );
}
