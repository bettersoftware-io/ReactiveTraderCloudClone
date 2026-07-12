import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type { EquityPosition } from "@rtc/domain";

const ROW_PREFIX = "position-row-";

/** Props the PositionsTable component reads — a pure props leaf. */
export interface PositionsTableProps {
  positions: readonly EquityPosition[];
}

/**
 * Page object for the prototype-ported PositionsTable: Symbol/Qty/Avg Px/
 * Last/Mkt Value/P&L columns, the DeskPnlGauge card, and each row's inline
 * PnlSparkline.
 */
export class PositionsTablePage extends MountedComponent<PositionsTableProps> {
  rowCount(): number {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`))
      .length;
  }

  private row(symbol: string): HTMLElement {
    return within(this.root).getByTestId(`${ROW_PREFIX}${symbol}`);
  }

  pnlSignOf(symbol: string): string | null {
    return this.row(symbol).getAttribute("data-pnl");
  }

  mktValueTextOf(symbol: string): string {
    return this.row(symbol).children[4]?.textContent ?? "";
  }

  plTextOf(symbol: string): string {
    return this.row(symbol).children[5]?.textContent ?? "";
  }

  isEmpty(): boolean {
    return within(this.root).queryByText(/no open positions/i) !== null;
  }

  hasDeskGauge(): boolean {
    return within(this.root).queryByLabelText(/desk p&l gauge/i) !== null;
  }
}
