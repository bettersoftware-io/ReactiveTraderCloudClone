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

  /** The canvas element, or null when absent. */
  canvas(): HTMLCanvasElement | null {
    return (
      (this.container().querySelector("canvas") as HTMLCanvasElement | null) ??
      null
    );
  }
}
