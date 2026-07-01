import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the PriceChart component reads (the instrument to chart). */
export interface PriceChartProps {
  symbol: string;
}

/**
 * Page object for the equity PriceChart. The chart paints candles onto a
 * <canvas> (pixel output owned by the visual tier); the DOM-assertable contract
 * is the labelled canvas plus a "NO DATA" placeholder when the series is empty.
 */
export class PriceChartPage extends MountedComponent<PriceChartProps> {
  /** True when a canvas labelled for the given symbol is rendered. */
  hasCanvasFor(symbol: string): boolean {
    return within(this.root).queryByLabelText(`${symbol} price chart`) !== null;
  }

  /** True when the empty-state placeholder is shown (no candles). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no data/i) !== null;
  }
}
