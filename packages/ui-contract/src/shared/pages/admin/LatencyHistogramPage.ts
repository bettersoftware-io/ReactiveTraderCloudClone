import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/** Page object for LatencyHistogram. */
export class LatencyHistogramPage extends MountedComponent<
  Record<string, never>
> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-latency-histogram");
  }

  /** True when the "NO DATA" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO DATA/i) !== null;
  }

  /** True when the histogram wrapper element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-latency-histogram") !== null;
  }

  /** Number of latency buckets rendered (always 6 once samples exist). */
  barCount(): number {
    return this.container().querySelectorAll("[data-accent]").length;
  }

  /** The bucket tick labels, in order. */
  labels(): string[] {
    return Array.from(this.container().querySelectorAll("[class*='tick']")).map(
      (el) => {
        return el.textContent ?? "";
      },
    );
  }

  /** The label of the bucket flagged data-accent="true" (the modal bucket), or null. */
  accentLabel(): string | null {
    const cols = Array.from(
      this.container().querySelectorAll("[class*='col']"),
    );

    const accented = cols.find((col) => {
      return col.querySelector("[data-accent='true']") !== null;
    });
    return accented?.querySelector("[class*='tick']")?.textContent ?? null;
  }
}
