import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for ChartPanel: the body composing InstrumentHeader +
 * CandleChart from the shared eqWorkspace machine's selection.
 */
export class ChartPanelPage extends MountedComponent<Record<string, never>> {
  isEmpty(): boolean {
    return within(this.root).queryByText(/select an instrument/i) !== null;
  }

  lastPrice(): string | null {
    return (
      within(this.root).queryByTestId("instrument-header-last")?.textContent ??
      null
    );
  }

  bid(): string | null {
    return (
      within(this.root).queryByTestId("instrument-header-bid")?.textContent ??
      null
    );
  }

  candleCount(): number {
    return this.root.querySelectorAll("[data-candle]").length;
  }
}
