import { within } from "@testing-library/dom";
import { MountedComponent } from "../../../harness/component";

export class FxBlotterPage extends MountedComponent<Record<string, never>> {
  private table(): HTMLElement {
    return within(this.root).getByTestId("blotter-table");
  }

  /** Number of trade rows shown (0 when the empty-state row is showing). */
  tradeRowCount(): number {
    if (this.emptyMessage() !== null) return 0;
    return this.table().querySelectorAll("tbody tr").length;
  }

  /** The empty-state message, or null when trades are present. */
  emptyMessage(): string | null {
    const el = within(this.root).queryByText(/no trades/i);
    return el?.textContent?.trim() ?? null;
  }

  /** True when a body cell with the given exact text is present. */
  hasCell(text: string): boolean {
    const tbody = this.table().querySelector("tbody");
    if (!tbody) return false;
    return within(tbody as HTMLElement).queryByText(text) !== null;
  }

  /** Column header labels, in order. */
  columnHeaders(): string[] {
    return within(this.table())
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim() ?? "");
  }
}
