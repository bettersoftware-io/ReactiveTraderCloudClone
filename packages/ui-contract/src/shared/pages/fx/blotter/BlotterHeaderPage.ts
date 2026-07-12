import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { Trade } from "@rtc/domain";

import type { ColumnFilter, SortState } from "./filterTypes";

export interface BlotterHeaderProps {
  sort: SortState;
  onSort: (column: keyof Trade) => void;
  filters: Map<keyof Trade, ColumnFilter>;
  onFilter: (column: keyof Trade, filter: ColumnFilter | null) => void;
  trades: readonly Trade[];
}

export class BlotterHeaderPage extends MountedComponent<BlotterHeaderProps> {
  private readonly user: UserEvent = userEvent.setup();

  private headerCells(): HTMLTableCellElement[] {
    return within(this.root).getAllByRole(
      "columnheader",
    ) as HTMLTableCellElement[];
  }

  private cellFor(label: string): HTMLTableCellElement {
    const cell = this.headerCells().find((th) => {
      return (th.querySelector("span")?.textContent ?? "").includes(label);
    });

    if (!cell) {
      throw new Error(`No header cell with label ${label}`);
    }

    return cell;
  }

  /** Header labels in order (without sort/filter indicators). */
  labels(): string[] {
    return this.headerCells().map((th) => {
      return th.querySelector("span")?.firstChild?.textContent?.trim() ?? "";
    });
  }

  /** Click a column header to drive the sort callback. */
  async clickHeader(label: string): Promise<void> {
    const span = this.cellFor(label).querySelector("span");

    if (!span) {
      throw new Error(`No <span> found in header cell "${label}"`);
    }

    await this.user.click(span);
  }

  /** True when the given header shows the ascending arrow. */
  showsAscending(label: string): boolean {
    return (this.cellFor(label).textContent ?? "").includes("▲");
  }

  /** True when the given header shows the descending arrow. */
  showsDescending(label: string): boolean {
    return (this.cellFor(label).textContent ?? "").includes("▼");
  }

  /**
   * Labels of the header(s) currently showing a sort glyph (▲ or ▼) — the
   * per-column filter toggle's "▽" caret is a distinct character and never
   * counts. Chrome parity requires this to name at most the one actively
   * sorted column.
   */
  columnsWithSortGlyph(): string[] {
    return this.headerCells()
      .filter((th) => {
        return /[▲▼]/.test(th.textContent ?? "");
      })
      .map((th) => {
        return th.querySelector("span")?.firstChild?.textContent?.trim() ?? "";
      });
  }

  /** Open (or toggle) the filter panel for a column via its dropdown toggle. */
  async openFilter(label: string): Promise<void> {
    const cell = this.cellFor(label);
    // The toggle is the button rendered with the literal "▽" caret; the
    // Apply/Reset buttons appear only once a panel is open.
    const toggle = within(cell)
      .getAllByRole("button")
      .find((b) => {
        return (b.textContent ?? "").includes("▽");
      });

    if (!toggle) {
      throw new Error(`No filter toggle for ${label}`);
    }

    await this.user.click(toggle);
  }

  /** True when a filter panel is open for the given column (its Apply button shows). */
  filterPanelOpen(label: string): boolean {
    return (
      within(this.cellFor(label)).queryByRole("button", {
        name: /^apply$/i,
      }) !== null
    );
  }

  /** Choose a comparator + value in an open number-filter panel and apply it. */
  async applyNumberFilter(
    label: string,
    comparator: string,
    value: string,
  ): Promise<void> {
    const cell = this.cellFor(label);
    const select = within(cell).getByRole("combobox") as HTMLSelectElement;
    await this.user.selectOptions(select, comparator);
    const valueInput = within(cell).getByPlaceholderText("Value");
    await this.user.clear(valueInput);
    await this.user.type(valueInput, value);
    await this.user.click(
      within(cell).getByRole("button", { name: /^apply$/i }),
    );
  }

  /** True when the column shows the active-filter marker. */
  hasActiveFilterDot(label: string): boolean {
    // The marker is the literal text "●" rendered next to the label.
    return (
      this.cellFor(label).querySelector("span")?.textContent ?? ""
    ).includes("●");
  }
}
