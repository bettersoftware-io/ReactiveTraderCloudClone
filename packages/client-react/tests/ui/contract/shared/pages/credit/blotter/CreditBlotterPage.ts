import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export class CreditBlotterPage extends MountedComponent<Record<string, never>> {
  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  private table(): HTMLTableElement {
    return this.root.querySelector("table") as HTMLTableElement;
  }

  /** Column header labels, in order. */
  columnHeaders(): string[] {
    return within(this.table())
      .getAllByRole("columnheader")
      .map((h) => {
        return h.textContent?.trim() ?? "";
      });
  }

  /** Number of trade rows (0 when only the empty-state row is showing). */
  tradeRowCount(): number {
    if (this.emptyMessage() !== null) return 0;
    return this.table().querySelectorAll("tbody tr").length;
  }

  /** The empty-state message, or null when trades are present. */
  emptyMessage(): string | null {
    const el = this.q().queryByText(/no credit trades yet/i);
    return el?.textContent?.trim() ?? null;
  }

  /** Ordered cell text for a given column across all visible trade rows. */
  columnValues(label: string): string[] {
    const headers = within(this.table()).getAllByRole("columnheader");
    const idx = headers.findIndex((h) => {
      return (h.textContent?.trim() ?? "") === label;
    });
    if (idx < 0) throw new Error(`No column header for ${label}`);
    const rows = [...this.table().querySelectorAll("tbody tr")];
    return rows
      .map((r) => {
        return r.querySelectorAll("td");
      })
      .filter((cells) => {
        return cells.length > 1;
      }) // skip the single-cell empty-state row
      .map((cells) => {
        return cells[idx]?.textContent?.trim() ?? "";
      });
  }

  /** True when a body cell with the given exact text is present. */
  hasCell(text: string): boolean {
    const tbody = this.table().querySelector("tbody");
    if (!tbody) return false;
    return within(tbody as HTMLElement).queryByText(text) !== null;
  }
}
