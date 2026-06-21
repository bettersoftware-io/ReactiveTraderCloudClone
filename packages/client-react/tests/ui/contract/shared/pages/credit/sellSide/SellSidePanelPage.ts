import { within } from "@testing-library/dom";
import { MountedComponent } from "../../../harness/component";

export class SellSidePanelPage extends MountedComponent<Record<string, never>> {
  private q() {
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
