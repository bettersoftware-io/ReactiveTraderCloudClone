import { MountedComponent } from "@ui-contract/harness/component";

import type { ChartVm } from "@rtc/motion-core";

/** Props the CandleChart component reads — pure props leaf: a precomputed
 * ChartVm (chartVm's own unit tests cover the geometry math). */
export interface CandleChartProps {
  vm: ChartVm;
}

/**
 * Page object for the CandleChart plot: grid lines, price labels, and
 * per-candle wick/body spans driven entirely by the ChartVm prop.
 */
export class CandleChartPage extends MountedComponent<CandleChartProps> {
  gridLineCount(): number {
    return this.root.querySelectorAll('[data-testid="chart-grid-line"]').length;
  }

  priceLabels(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-price-label"]'),
    ).map((el) => {
      return el.textContent ?? "";
    });
  }

  candleCount(): number {
    return this.root.querySelectorAll("[data-candle]").length;
  }

  lastCandleUp(): boolean | null {
    const body = this.root.querySelector('[data-last="true"]');
    return body ? body.getAttribute("data-up") === "true" : null;
  }

  lastCandleGlows(): boolean {
    return (
      this.root
        .querySelector('[data-last="true"]')
        ?.getAttribute("data-glow") === "true"
    );
  }
}
