import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

const CELL_PREFIX = "heatmap-cell-";

/**
 * Page object for EqSectorsDock — eq-sectors' dock registration: wires
 * SectorHeatmap's `selectedSymbol`/`onSelect` to the shared eqWorkspace
 * machine (reads `state.sel`, clicking a cell calls `select`).
 */
export class EqSectorsDockPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private cellFor(symbol: string): HTMLElement {
    return within(this.root).getByTestId(`${CELL_PREFIX}${symbol}`);
  }

  /** `data-active` of the given symbol's cell — reflects eqWorkspace's `sel`. */
  isActive(symbol: string): boolean {
    return this.cellFor(symbol).getAttribute("data-active") === "true";
  }

  /** Click a cell → calls the shared eqWorkspace machine's `select` intent. */
  async select(symbol: string): Promise<void> {
    await this.user.click(this.cellFor(symbol));
  }
}
