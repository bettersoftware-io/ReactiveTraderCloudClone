import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Structural duplicate of client-react's `src/ui/equities/chart/chartVm.ts`
 * `ChartVm` shape (verbatim field names — no logic). The `style`/`wickStyle`
 * fields are typed `object` rather than React's `CSSProperties` (the real
 * type) — this page object never reads them, it only needs a shape the real
 * ChartVm value structurally satisfies when a spec passes one in. Duplicated
 * rather than imported cross-package because `@rtc/ui-contract` may depend
 * only on `@rtc/client-core`/`@rtc/domain`/rxjs (see `.dependency-cruiser.cjs`),
 * and the real ChartVm is React-coupled (imports `CSSProperties`).
 */
interface CandleVm {
  key: number;
  up: boolean;
  last: boolean;
  glow: boolean;
  style: object;
  wickStyle: object;
}

interface GridLineVm {
  key: number;
  style: object;
}

interface PriceLabelVm {
  key: number;
  txt: string;
  style: object;
}

interface ChartVm {
  candles: readonly CandleVm[];
  grid: readonly GridLineVm[];
  labels: readonly PriceLabelVm[];
}

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
