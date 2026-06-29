import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the PnlSparkline component reads (a single P&L value + optional scale). */
export interface PnlSparklineProps {
  pnl: number;
  maxAbsPnl?: number;
}

/**
 * Page object for the PnlSparkline mini-bar. Pure props leaf: a centred SVG bar
 * extending right (positive, accent-positive) or left (negative, accent-negative).
 */
export class PnlSparklinePage extends MountedComponent<PnlSparklineProps> {
  /** True when the sparkline SVG is rendered. */
  hasSvg(): boolean {
    return this.root.querySelector("svg") !== null;
  }

  /** The fill colour token of the P&L bar path (positive vs negative accent). */
  barFill(): string | null {
    return this.root.querySelector("path")?.getAttribute("fill") ?? null;
  }
}
