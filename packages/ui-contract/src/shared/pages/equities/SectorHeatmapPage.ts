import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** Props the SectorHeatmap component reads (selection + a select callback). */
export interface SectorHeatmapProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

const CELL_PREFIX = "heatmap-cell-";

/**
 * Page object for the equity SectorHeatmap. Dumb grid: reads instruments from
 * `useWatchlist()`, groups them by a static sector map, and paints each cell's
 * change% as `--heat` + an up/down `data-direction`.
 */
export class SectorHeatmapPage extends MountedComponent<SectorHeatmapProps> {
  private readonly user: UserEvent = userEvent.setup();

  private cellEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${CELL_PREFIX}`));
  }

  private cellFor(symbol: string): HTMLElement {
    return within(this.root).getByTestId(`${CELL_PREFIX}${symbol}`);
  }

  /** The symbols of the rendered cells, in order. */
  cells(): string[] {
    return this.cellEls().map((el) => {
      return el.getAttribute("data-testid")?.replace(CELL_PREFIX, "") ?? "";
    });
  }

  /** True when the empty-state placeholder is shown (no instruments). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no data/i) !== null;
  }

  /** The `--heat` value [0, 1] a cell paints for its change%. */
  heatOf(symbol: string): number {
    const raw = this.cellFor(symbol).style.getPropertyValue("--heat").trim();
    return raw === "" ? 0 : Number(raw);
  }

  /** The up/down direction a cell paints for its change%. */
  directionOf(symbol: string): string | null {
    return this.cellFor(symbol).getAttribute("data-direction");
  }

  /** Click a cell → fires the onSelect prop with its symbol. */
  async select(symbol: string): Promise<void> {
    await this.user.click(this.cellFor(symbol));
  }

  /**
   * True when a sector-group label matching `name` is rendered (case-insensitive).
   * The component renders `{sector.toUpperCase()}` as text — this probes that
   * text node so the assertion fails if the unknown-symbol → DEFAULT_SECTOR
   * mapping is broken.
   */
  hasSectorLabel(name: string): boolean {
    return within(this.root).queryByText(new RegExp(`^${name}$`, "i")) !== null;
  }
}
