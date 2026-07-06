import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { DepthLadder } from "./DepthLadder";

import styles from "./DepthLadder.module.css";

/**
 * eq-depth's dock registration: DepthLadder is a dumb `symbol`-prop component
 * (its contract/visual specs mount it directly with a fixed symbol, since it
 * survives outside the four-panel default tree — Task 6 brief), so this
 * wrapper feeds it the shared eqWorkspace selection instead, mirroring
 * OrderTicket's own internal fallback to `workspace.state.sel`.
 */
export function EqDepthDock(): ReactElement {
  const { useEqWorkspace } = useViewModel();
  const { state } = useEqWorkspace();

  if (!state.sel) {
    return <div className={styles.empty}>SELECT AN INSTRUMENT</div>;
  }

  return <DepthLadder symbol={state.sel} />;
}
