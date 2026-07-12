import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for RfqsHead — the static "◳ RFQs" title plus the
 * LIVE/CLOSED/ALL filter pills (RfqFilterPills), which write the shared
 * useCreditRfqFilterPreference seam. Reads the same head chrome as
 * AnalyticsHeadPage/PositionsHeadPage for the title, plus the pill queries
 * RfqFilterPillsPage uses.
 */
export class RfqsHeadPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  titleText(): string | null {
    return (
      within(this.root).queryByTestId("rfqs-head-title")?.textContent ?? null
    );
  }

  isTitleActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("rfqs-head-title")
        ?.getAttribute("data-active") === "true"
    );
  }

  /** testid → pill label text, e.g. "live" → "LIVE (3)". */
  pillText(testId: "live" | "closed" | "all"): string {
    return this.pill(testId).textContent?.trim() ?? "";
  }

  isPillActive(testId: "live" | "closed" | "all"): boolean {
    return this.pill(testId).dataset.active === "true";
  }

  async clickPill(testId: "live" | "closed" | "all"): Promise<void> {
    await this.user.click(this.pill(testId));
  }

  private pill(testId: "live" | "closed" | "all"): HTMLElement {
    return within(this.root).getByTestId(`rfq-filter-${testId}`);
  }
}
