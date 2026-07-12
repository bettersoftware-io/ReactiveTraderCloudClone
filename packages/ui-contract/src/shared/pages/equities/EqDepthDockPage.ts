import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for EqDepthDock — eq-depth's dock registration: reads the shared
 * eqWorkspace selection and either shows the "SELECT AN INSTRUMENT" placeholder
 * (no selection) or mounts DepthLadder for the selected symbol.
 */
export class EqDepthDockPage extends MountedComponent<Record<string, never>> {
  /** True when the no-selection placeholder is shown (workspace `sel` is ""). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/select an instrument/i) !== null;
  }

  /** Number of rows for a given side, delegating to the DepthLadder it wraps. */
  rowCount(side: "bid" | "ask"): number {
    return this.root.querySelectorAll(`[data-side="${side}"]`).length;
  }
}
