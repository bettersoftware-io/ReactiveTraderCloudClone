import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export class CreditBlotterPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private table(): HTMLElement {
    return within(this.root).getByTestId("blotter-table");
  }

  /** Column header labels (label text only, without sort/filter glyphs), in order. */
  columnHeaders(): string[] {
    return within(this.table())
      .getAllByRole("columnheader")
      .map((h) => {
        // Extract just the label text from the <span>'s first text node,
        // which is the label before any sort indicator or filter dot.
        const spanText = (
          h.querySelector("span")?.firstChild?.textContent ?? ""
        ).trim();
        return (
          spanText || (h.textContent?.replace("▽", "").trim() ?? "")
        );
      });
  }

  /** Number of trade rows (0 when only the empty-state row is showing). */
  tradeRowCount(): number {
    if (this.emptyMessage() !== null) return 0;
    return this.table().querySelectorAll("tbody tr").length;
  }

  /** The empty-state message, or null when trades are present. */
  emptyMessage(): string | null {
    const el = within(this.root).queryByText(/no credit trades yet/i);
    return el?.textContent?.trim() ?? null;
  }

  /** Ordered cell text for a given column across all visible trade rows. */
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

  /** True when a body cell with the given exact text is present. */
  hasCell(text: string): boolean {
    const tbody = this.table().querySelector("tbody");
    if (!tbody) return false;
    return within(tbody as HTMLElement).queryByText(text) !== null;
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

  async typeQuickFilter(text: string): Promise<void> {
    const input = within(this.root).getByTestId("quick-filter");
    await this.user.clear(input);
    if (text) await this.user.type(input, text);
  }

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

  /** Choose a comparator and value in an open number-filter panel, then apply. */
  async applyNumberFilter(comparator: string, value: string): Promise<void> {
    const select = within(this.root).getByRole("combobox") as HTMLSelectElement;
    await this.user.selectOptions(select, comparator);
    const valueInput = within(this.root).getByPlaceholderText("Value");
    await this.user.clear(valueInput);
    await this.user.type(valueInput, value);
    await this.applyOpenFilter();
  }

  /** Export-CSV trigger. */
  async clickExport(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("export-csv"));
  }
}
