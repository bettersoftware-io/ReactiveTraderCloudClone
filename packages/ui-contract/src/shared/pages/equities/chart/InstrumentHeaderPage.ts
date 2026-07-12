import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type { Candle, EquityQuote } from "@rtc/domain";

/** Props the InstrumentHeader component reads — pure props leaf, no hook
 * wiring (ChartPanel owns useEquityQuote/useCandles/the tick-flash ref). */
export interface InstrumentHeaderProps {
  symbol: string;
  instrumentName?: string;
  exchange?: string;
  quote: EquityQuote | null;
  candles: readonly Candle[];
  flashOn: boolean;
  flashDir: "up" | "down";
}

/**
 * Page object for the presentational InstrumentHeader: the big last price,
 * abs+pct change, and the BID/ASK/DAY RANGE/VOL stat strip.
 */
export class InstrumentHeaderPage extends MountedComponent<InstrumentHeaderProps> {
  private testId(id: string): HTMLElement {
    return within(this.root).getByTestId(id);
  }

  last(): string {
    return this.testId("instrument-header-last").textContent ?? "";
  }

  flashOn(): boolean {
    return (
      this.testId("instrument-header-last").getAttribute("data-flash") ===
      "true"
    );
  }

  flashDir(): string | null {
    return this.testId("instrument-header-last").getAttribute("data-dir");
  }

  change(): string {
    return this.testId("instrument-header-change").textContent ?? "";
  }

  bid(): string {
    return this.testId("instrument-header-bid").textContent ?? "";
  }

  ask(): string {
    return this.testId("instrument-header-ask").textContent ?? "";
  }

  dayRange(): string {
    return this.testId("instrument-header-range").textContent ?? "";
  }

  vol(): string {
    return this.testId("instrument-header-vol").textContent ?? "";
  }
}
