import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for ThroughputChart. */
export class ThroughputChartPage extends MountedComponent<
  Record<string, never>
> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-throughput-chart");
  }

  /** True when the "NO DATA" placeholder is shown (no samples yet). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO DATA/i) !== null;
  }

  /** True when the chart wrapper element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-throughput-chart") !== null;
  }

  /** The gradient-glow area+line <svg>, or null when "NO DATA" is shown. */
  svg(): SVGSVGElement | null {
    return this.container().querySelector("svg");
  }

  /** The `d` attribute of the gradient-filled area <path>, or null. */
  areaPath(): string | null {
    return this.svg()?.querySelector("path")?.getAttribute("d") ?? null;
  }

  /** The `points` attribute of the glow <polyline>, or null. */
  linePoints(): string | null {
    return (
      this.svg()?.querySelector("polyline")?.getAttribute("points") ?? null
    );
  }
}
