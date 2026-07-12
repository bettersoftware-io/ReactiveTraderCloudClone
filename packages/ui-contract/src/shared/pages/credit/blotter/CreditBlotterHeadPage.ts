import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for CreditBlotterHead — the always-active single tab (this
 * panel has only one view) plus, mirroring FxBlotterHead, the right-aligned
 * unfiltered trade count, quick-filter input, and CSV export chip. The
 * count/filter/CSV SEAM behaviour (head driving the body) is exercised via
 * CreditBlotterWorkspacePage; this page covers the head's own rendering.
 */
export class CreditBlotterHeadPage extends MountedComponent<
  Record<string, never>
> {
  titleText(): string | null {
    return (
      within(this.root).queryByTestId("credit-blotter-head-title")
        ?.textContent ?? null
    );
  }

  isActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("credit-blotter-head-title")
        ?.getAttribute("data-active") === "true"
    );
  }

  /** The "{n} trades" count — always the UNFILTERED total, like FX. */
  tradeCountText(): string | null {
    return (
      within(this.root).queryByTestId("blotter-count")?.textContent?.trim() ??
      null
    );
  }

  hasQuickFilter(): boolean {
    return within(this.root).queryByTestId("quick-filter") !== null;
  }

  /** The CSV export chip's visible label (at the `export-csv` testid). */
  csvChipLabel(): string {
    return (
      within(this.root).queryByTestId("export-csv")?.textContent?.trim() ?? ""
    );
  }
}
