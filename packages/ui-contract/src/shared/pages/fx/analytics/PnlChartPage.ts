import { MountedComponent } from "@ui-contract/harness/component";

import type { HistoricPosition } from "@rtc/domain";

/** Props the PnlChart component reads (the P&L history series). */
export interface PnlChartProps {
  history: readonly HistoricPosition[];
}

/**
 * Page object for the PnlChart smooth glow-area chart. Pure props leaf: a
 * single smoothed `<path>` line over a gradient-filled area `<path>`, both
 * keyed off `data-sign` for the positive/negative accent.
 */
export class PnlChartPage extends MountedComponent<PnlChartProps> {
  private lineEl(): SVGPathElement | null {
    return this.root.querySelector("path[fill='none']");
  }

  private areaEl(): SVGPathElement | null {
    return this.root.querySelector("path:not([fill='none'])");
  }

  /** True when the chart SVG is rendered at all (>= 2 history points). */
  hasSvg(): boolean {
    return this.root.querySelector("svg") !== null;
  }

  /** The `d` attribute of the smoothed line path, or null when not rendered. */
  linePath(): string | null {
    return this.lineEl()?.getAttribute("d") ?? null;
  }

  /** The `d` attribute of the gradient area path, or null when not rendered. */
  areaPath(): string | null {
    return this.areaEl()?.getAttribute("d") ?? null;
  }

  /** The `fill` attribute of the area path (expected: a `url(#...)` gradient reference). */
  areaFill(): string | null {
    return this.areaEl()?.getAttribute("fill") ?? null;
  }

  /** The `data-sign` shared by the line and area paths ("positive" | "negative"). */
  sign(): string | null {
    return this.lineEl()?.getAttribute("data-sign") ?? null;
  }

  /** True when a dashed zero baseline `<line>` is drawn (0 within the value range). */
  hasZeroLine(): boolean {
    return this.root.querySelector("line") !== null;
  }

  /** Number of `<path>` elements drawn (0 when there are too few history points). */
  pathCount(): number {
    return this.root.querySelectorAll("path").length;
  }
}
