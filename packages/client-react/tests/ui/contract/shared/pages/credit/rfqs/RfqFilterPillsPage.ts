import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CreditRfqFilter } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface RfqFilterPillsProps {
  filter: CreditRfqFilter;
  liveCount: number;
  onFilter: (filter: CreditRfqFilter) => void;
}

export class RfqFilterPillsPage extends MountedComponent<RfqFilterPillsProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** testid → pill label text, e.g. "rfq-filter-live" → "LIVE 3". */
  text(testId: "live" | "closed" | "all"): string {
    return this.pill(testId).textContent?.trim() ?? "";
  }

  /** Whether the given pill is rendered active. */
  isActive(testId: "live" | "closed" | "all"): boolean {
    return this.pill(testId).dataset.active === "true";
  }

  /** Click the given pill. */
  async click(testId: "live" | "closed" | "all"): Promise<void> {
    await this.user.click(this.pill(testId));
  }

  private pill(testId: "live" | "closed" | "all"): HTMLElement {
    return within(this.root).getByTestId(`rfq-filter-${testId}`);
  }
}
