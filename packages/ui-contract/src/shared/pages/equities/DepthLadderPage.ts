import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/** Props the DepthLadder component reads (the instrument to show depth for). */
export interface DepthLadderProps {
  symbol: string;
}

/**
 * Page object for the equity DepthLadder. Dumb book view: reads `useDepth(symbol)`,
 * renders bid/ask rows (each `data-side`), a spread line, or a "NO DEPTH DATA"
 * placeholder when the book is null.
 */
export class DepthLadderPage extends MountedComponent<DepthLadderProps> {
  /** True when the empty-state placeholder is shown (no book). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no depth data/i) !== null;
  }

  /** Number of rows for a given side (capped at 8 by the component). */
  rowCount(side: "bid" | "ask"): number {
    return this.root.querySelectorAll(`[data-side="${side}"]`).length;
  }

  /** The spread line text (e.g. "SPREAD 0.10"), or null when absent. */
  spread(): string | null {
    const el = within(this.root).queryByText(/spread/i);
    return el?.textContent?.trim() ?? null;
  }
}
