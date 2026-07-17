import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { SectorHeatmap } from "./SectorHeatmap";

/**
 * eq-sectors' dock registration: SectorHeatmap takes an explicit
 * selectedSymbol/onSelect pair (its contract/visual specs mount it directly
 * with fixed props, since it survives outside the four-panel default tree —
 * Task 6 brief), so this wrapper wires it to the shared eqWorkspace
 * selection/select.
 */
export function EqSectorsDock(): JSX.Element {
  const { useEqWorkspace } = useViewModel();
  const { state, select } = useEqWorkspace();
  return <SectorHeatmap selectedSymbol={state().sel} onSelect={select} />;
}
