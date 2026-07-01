import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for LatencyHistogram. */
export class LatencyHistogramPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the "NO DATA" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO DATA/i) !== null;
  }

  /** True when the histogram wrapper element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-latency-histogram") !== null;
  }

  /** The peak latency text shown in the header. */
  peakText(): string | null {
    const el = this.root.querySelector("[class*='peak']");
    return el?.textContent?.trim() ?? null;
  }

  /** Number of SVG bar rectangles rendered. */
  barCount(): number {
    const svg = this.root.querySelector(
      "[data-testid='admin-latency-histogram'] svg",
    );
    return svg?.querySelectorAll("rect").length ?? 0;
  }
}
