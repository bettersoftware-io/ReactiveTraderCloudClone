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
        return spanText || (h.textContent?.replace("▽", "").trim() ?? "");
      });
  }

  /**
   * True when the column-header row lives in a SEPARATE table from the rows —
   * the split-header structure that keeps the header fixed above the scrolling
   * rows region and the filter popover outside its scroll clip (same shape as
   * FxBlotterPage.headerIsSplitFromRows).
   */
  headerIsSplitFromRows(): boolean {
    const th = this.table().querySelector("th");
    const tbody = this.table().querySelector("tbody");

    if (!th || !tbody) {
      return false;
    }

    return th.closest("table") !== tbody.closest("table");
  }

  /** Number of trade rows (0 when only the empty-state row is showing). */
  tradeRowCount(): number {
    if (this.emptyMessage() !== null) {
      return 0;
    }

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

    if (idx < 0) {
      throw new Error(`No column header for ${label}`);
    }

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

    if (!tbody) {
      return false;
    }

    return within(tbody as HTMLElement).queryByText(text) !== null;
  }

  // --- sorting -------------------------------------------------------------

  private headerCell(label: string): HTMLTableCellElement {
    const cell = within(this.table())
      .getAllByRole("columnheader")
      .find((th) => {
        return (th.querySelector("span")?.textContent ?? "").includes(label);
      });

    if (!cell) {
      throw new Error(`No header cell with label ${label}`);
    }

    return cell as HTMLTableCellElement;
  }

  /** Click a column header to toggle its sort. */
  async clickColumnHeader(label: string): Promise<void> {
    const span = this.headerCell(label).querySelector("span");

    if (!span) {
      throw new Error(`No <span> found in column header "${label}"`);
    }

    await this.user.click(span);
  }

  sortIndicatorFor(label: string): "asc" | "desc" | null {
    const text = this.headerCell(label).textContent ?? "";

    if (text.includes("▲")) {
      return "asc";
    }

    if (text.includes("▼")) {
      return "desc";
    }

    return null;
  }

  // --- quick filter --------------------------------------------------------
  //
  // The quick-filter input itself moved to CreditBlotterHead — this component
  // only reads `quickFilter` from CreditViewContext. Typing it is exercised
  // via CreditBlotterWorkspacePage (head + body mounted together), not here
  // (same split as FxBlotterPage / FxBlotterWorkspacePage).

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

  // --- CSV export / trade count ---------------------------------------------
  //
  // The CSV chip and the "{n} trades" count moved to CreditBlotterHead; they
  // are exercised via CreditBlotterWorkspacePage, not here.

  // --- prototype chrome: per-row direction accent + new-trade flash --------

  private rows(): HTMLTableRowElement[] {
    return [
      ...this.table().querySelectorAll("tbody tr"),
    ] as HTMLTableRowElement[];
  }

  /** Locate a trade row by its Trade ID column text (the first cell). */
  private rowForTradeId(tradeId: string): HTMLTableRowElement {
    const row = this.rows().find((r) => {
      return r.querySelector("td")?.textContent?.trim() === tradeId;
    });

    if (!row) {
      throw new Error(`No row for trade id ${tradeId}`);
    }

    return row;
  }

  /** The row's `--row-acc` custom property value (PROTO rowAccent()). */
  rowAccent(tradeId: string): string {
    return this.rowForTradeId(tradeId)
      .style.getPropertyValue("--row-acc")
      .trim();
  }

  /** The row's `data-dir` attribute (Buy/Sell). */
  rowDirection(tradeId: string): string | null {
    return this.rowForTradeId(tradeId).getAttribute("data-dir");
  }

  /** Whether the row is currently flagged as a newly-streamed-in trade. */
  isRowNew(tradeId: string): boolean {
    return this.rowForTradeId(tradeId).getAttribute("data-new") === "true";
  }
}
