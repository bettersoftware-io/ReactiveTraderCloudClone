import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

export class SellSidePanelPage extends MountedComponent<Record<string, never>> {
  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** The empty-state message, or null when tickets are present. */
  emptyMessage(): string | null {
    const el = this.q().queryByText(/no rfqs for adaptive bank/i);
    return el?.textContent?.trim() ?? null;
  }

  /** Number of trade tickets rendered (each shows a Qty: line). */
  ticketCount(): number {
    return this.q().queryAllByText(/qty:/i).length;
  }

  /** Whether any text matching the supplied value is present. */
  hasText(text: string | RegExp): boolean {
    return this.q().queryByText(text) !== null;
  }
}
