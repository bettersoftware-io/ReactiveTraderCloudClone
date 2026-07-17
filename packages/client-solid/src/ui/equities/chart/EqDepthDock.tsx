import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { DepthLadder } from "./DepthLadder";

import styles from "./DepthLadder.module.css";

/**
 * eq-depth's dock registration: DepthLadder is a dumb `symbol`-prop component
 * (its contract/visual specs mount it directly with a fixed symbol, since it
 * survives outside the four-panel default tree — Task 6 brief), so this
 * wrapper feeds it the shared eqWorkspace selection instead, mirroring
 * OrderTicket's own internal fallback to `workspace.state().sel`.
 *
 * Keyed on the symbol itself: `useDepth` takes a plain `symbol` (mirroring
 * the react ViewModel's per-render hook-call shape), so a changing selection
 * needs `<DepthLadder>` fully REMOUNTED (Solid's keyed `<Show>` does this
 * when the keyed value changes) rather than updated in place — see
 * ChartPanel.tsx's doc comment for the full reasoning.
 */
export function EqDepthDock(): JSX.Element {
  const { useEqWorkspace } = useViewModel();
  const { state } = useEqWorkspace();

  return (
    <Show
      when={state().sel}
      keyed
      fallback={<div class={styles.empty}>SELECT AN INSTRUMENT</div>}
    >
      {(symbol: string): JSX.Element => {
        return <DepthLadder symbol={symbol} />;
      }}
    </Show>
  );
}
