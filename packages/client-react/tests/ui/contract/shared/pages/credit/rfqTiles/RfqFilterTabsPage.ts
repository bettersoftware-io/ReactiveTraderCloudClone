import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled";

export interface RfqFilterTabsProps {
  selected: RfqFilter;
  onChange: (filter: RfqFilter) => void;
}

export class RfqFilterTabsPage extends MountedComponent<RfqFilterTabsProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** All tab labels, in order. */
  tabLabels(): string[] {
    return this.q()
      .getAllByRole("button")
      .map((b) => {
        return b.textContent?.trim() ?? "";
      });
  }

  /** Whether the tab with the given label is rendered as the active one. */
  isActive(label: string): boolean {
    const btn = this.q().getByRole("button", { name: label });
    return btn.dataset.active === "true";
  }

  /** Click the tab with the given label. */
  async clickTab(label: string): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: label }));
  }
}
