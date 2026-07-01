import { fireEvent, within } from "@testing-library/dom";

import type { CurrencyPairPosition } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

/** Page object for the PairPnlBars chart leaf. */
export class PairPnlBarsPage extends MountedComponent<PairPnlBarsProps> {
  /** The P&L label text for one pair symbol, e.g. "1k" (or "1,234.00" while hovered). */
  labelFor(symbol: string): string {
    const el = within(this.root).queryByTestId(`priceLabel-${symbol}`);
    return el?.textContent?.trim() ?? "";
  }

  /** Move the pointer onto a pair's label to switch it to the precise format. */
  hover(symbol: string): void {
    const el = within(this.root).getByTestId(`priceLabel-${symbol}`);
    // React 19 synthesises onMouseEnter from native mouseover at the root.
    fireEvent.mouseOver(el);
    fireEvent.mouseEnter(el);
    // Flush the resulting React state update through the driver's act wrapper.
    this.setProps({});
  }

  /** Move the pointer off a pair's label to return it to the scaled format. */
  unhover(symbol: string): void {
    const el = within(this.root).getByTestId(`priceLabel-${symbol}`);
    fireEvent.mouseOut(el);
    fireEvent.mouseLeave(el);
    this.setProps({});
  }
}
