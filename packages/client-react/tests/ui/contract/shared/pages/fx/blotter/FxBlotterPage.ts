import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export class FxBlotterPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

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

  /**
   * True when the column-header row lives in a SEPARATE table from the rows —
   * the split-header structure that keeps the header fixed above the scrolling
   * rows region and the filter popover outside its scroll clip.
   */
  headerIsSplitFromRows(): boolean {
    const th = this.table().querySelector("th");
    const tbody = this.table().querySelector("tbody");
    if (!th || !tbody) return false;
    return th.closest("table") !== tbody.closest("table");
  }

  /** Column header labels, in order. */
  columnHeaders(): string[] {
    return within(this.table())
      .getAllByRole("columnheader")
      .map((h) => {
        return h.textContent?.trim() ?? "";
      });
  }

  /** Ordered cell text for a given column across all visible rows. */
  columnValues(label: string): string[] {
    const headers = within(this.table()).getAllByRole("columnheader");
    const idx = headers.findIndex((h) => {
      return (h.querySelector("span")?.firstChild?.textContent ?? "")
        .trim()
        .startsWith(label);
    });
    if (idx < 0) throw new Error(`No column header for ${label}`);
    const rows = [...this.table().querySelectorAll("tbody tr")];
    return rows
      .map((r) => {
        return r.querySelectorAll("td");
      })
      .filter((cells) => {
        return cells.length > idx && cells.length > 1;
      }) // skip empty-state row (single colspan cell)
      .map((cells) => {
        return cells[idx]?.textContent?.trim() ?? "";
      });
  }

  // --- sorting -------------------------------------------------------------

  private headerCell(label: string): HTMLTableCellElement {
    const cell = within(this.table())
      .getAllByRole("columnheader")
      .find((th) => {
        return (th.querySelector("span")?.textContent ?? "").includes(label);
      });
    if (!cell) throw new Error(`No header cell with label ${label}`);
    return cell as HTMLTableCellElement;
  }

  /** Click a column header to toggle its sort. */
  async clickColumnHeader(label: string): Promise<void> {
    const span = this.headerCell(label).querySelector("span");
    if (!span) throw new Error(`No <span> found in column header "${label}"`);
    await this.user.click(span);
  }

  sortIndicatorFor(label: string): "asc" | "desc" | null {
    const text = this.headerCell(label).textContent ?? "";
    if (text.includes("▲")) return "asc";
    if (text.includes("▼")) return "desc";
    return null;
  }

  // --- quick filter --------------------------------------------------------
  //
  // The quick-filter input itself moved to FxBlotterHead (Task 12) — this
  // component only reads `quickFilter` from FxViewContext. Typing it is
  // exercised via FxBlotterWorkspacePage (head + body mounted together),
  // not here.

  /** The "Filtered: …" summary label, or null when no column filter is active. */
  activeFilterSummary(): string | null {
    const el = within(this.root).queryByText(/^filtered:/i);
    return el?.textContent?.trim() ?? null;
  }

  // --- column filters ------------------------------------------------------

  /** Open the filter dropdown for the named column. */
  async openColumnFilter(label: string): Promise<void> {
    const btn = within(this.headerCell(label)).getByRole("button");
    await this.user.click(btn);
  }

  /** In an open set-filter panel, toggle one of its checkbox options. */
  async toggleSetOption(label: string): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("checkbox", { name: label }),
    );
  }

  /** Click Apply in whichever filter panel is currently open. */
  async applyOpenFilter(): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("button", { name: /^apply$/i }),
    );
  }

  /** Click Reset in whichever number/date filter panel is currently open. */
  async resetOpenFilter(): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("button", { name: /^reset$/i }),
    );
  }

  /** Choose a comparator and value in an open number-filter panel, then apply. */
  async applyNumberFilter(comparator: string, value: string): Promise<void> {
    const select = within(this.root).getByRole("combobox") as HTMLSelectElement;
    await this.user.selectOptions(select, comparator);
    const valueInput = within(this.root).getByPlaceholderText("Value");
    await this.user.clear(valueInput);
    await this.user.type(valueInput, value);
    await this.applyOpenFilter();
  }
}
