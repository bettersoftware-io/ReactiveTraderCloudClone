import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

const ROW_PREFIX = "position-row-";

/**
 * Page object for the equity PositionsBlotter. Dumb table: reads
 * `useEquityPositions()`, renders a row per position (`data-pnl` sign) plus the
 * composed DeskPnlGauge, or a "NO POSITIONS" placeholder when empty.
 */
export class PositionsBlotterPage extends MountedComponent<
  Record<string, never>
> {
  /** Number of position rows rendered (0 in the empty state). */
  rowCount(): number {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`))
      .length;
  }

  /** The P&L sign ("pos" | "neg") a given position row paints. */
  pnlSignOf(symbol: string): string | null {
    return within(this.root)
      .getByTestId(`${ROW_PREFIX}${symbol}`)
      .getAttribute("data-pnl");
  }

  /** True when the empty-state placeholder is shown (no positions). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no positions/i) !== null;
  }

  /** True when the composed desk P&L gauge is present. */
  hasDeskGauge(): boolean {
    return within(this.root).queryByLabelText(/desk p&l gauge/i) !== null;
  }
}
