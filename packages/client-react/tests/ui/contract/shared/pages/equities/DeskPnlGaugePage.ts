import type { EquityPosition } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the DeskPnlGauge component reads (the desk's open positions). */
export interface DeskPnlGaugeProps {
  positions: readonly EquityPosition[];
}

/**
 * Page object for the DeskPnlGauge speedometer. Pure props leaf: aggregates the
 * positions' unrealised P&L into a signed needle + a formatted readout.
 */
export class DeskPnlGaugePage extends MountedComponent<DeskPnlGaugeProps> {
  private valueEl(): HTMLElement {
    const el = this.root.querySelector("[data-sign]");

    if (!el) {
      throw new Error("DeskPnlGauge value element not found");
    }

    return el as HTMLElement;
  }

  /** The aggregate sign ("pos" | "neg") the readout paints. */
  sign(): string | null {
    return this.valueEl().getAttribute("data-sign");
  }

  /** The formatted desk-P&L readout (e.g. "+1.5k", "-300", "+0"). */
  value(): string {
    return this.valueEl().textContent?.trim() ?? "";
  }

  /** Number of fill arcs drawn (0 when |P&L| ≈ 0 → degenerate arc suppressed). */
  fillArcCount(): number {
    // The track + fill are <path> elements; the degenerate-zero case omits fill.
    return this.root.querySelectorAll("path").length;
  }
}
