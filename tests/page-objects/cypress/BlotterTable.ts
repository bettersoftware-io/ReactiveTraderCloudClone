import type { BlotterTablePO } from "../contracts/BlotterTable";
import { TESTIDS } from "../contracts/testids";

export class CypressBlotterTable implements BlotterTablePO {
  private tableEl() {
    return cy.get(`[data-testid="${TESTIDS.blotter.table}"]`);
  }
  private rows() {
    return this.tableEl().find("tbody tr");
  }
  private firstRow() {
    return this.rows().first();
  }

  waitVisible(timeoutMs: number): Promise<void> {
    return cy.get(`[data-testid="${TESTIDS.blotter.table}"]`, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  isVisible(): Promise<boolean> {
    // Playwright's isVisible() returns true even for below-fold elements.
    // Cypress considers off-viewport elements "not visible". Match Playwright's
    // behavior by checking for DOM presence (not CSS hidden) rather than strict
    // Cypress viewport-visibility.
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.blotter.table}"]`);
      if (found.length === 0) return false;
      const css = (found as JQuery<HTMLElement>).css("display");
      return css !== "none";
    }) as unknown as Promise<boolean>;
  }

  rowCount(): Promise<number> {
    return this.rows()
      .then(($rows) => $rows.length) as unknown as Promise<number>;
  }

  clickFirstHeader(): Promise<void> {
    return this.tableEl()
      .find("th")
      .first()
      .click() as unknown as Promise<void>;
  }

  fillQuickFilter(text: string): Promise<void> {
    return cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`)
      .clear()
      .type(text) as unknown as Promise<void>;
  }

  clearQuickFilter(): Promise<void> {
    return cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`)
      .clear() as unknown as Promise<void>;
  }

  isExportCsvVisible(): Promise<boolean> {
    // Use css("display") !== "none" instead of jQuery :visible, because
    // Cypress's :visible requires the element to be within the viewport —
    // but the blotter sits below the fold. This matches the same pattern
    // used in isVisible() for the blotter table itself.
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.blotter.exportCsv}"]`);
      if (found.length === 0) return false;
      const css = (found as JQuery<HTMLElement>).css("display");
      return css !== "none";
    }) as unknown as Promise<boolean>;
  }

  exportCsvText(): Promise<string> {
    return cy.get(`[data-testid="${TESTIDS.blotter.exportCsv}"]`)
      .then(($el) => $el.text()) as unknown as Promise<string>;
  }

  hoverFirstRow(): Promise<void> {
    return this.firstRow()
      .trigger("mouseover") as unknown as Promise<void>;
  }

  firstRowBackgroundColor(): Promise<string> {
    return this.firstRow()
      .then(($el) => getComputedStyle($el[0]).backgroundColor) as unknown as Promise<string>;
  }

  isFirstRowVisible(): Promise<boolean> {
    // Use css("display") !== "none" instead of jQuery :visible for the same
    // reason as isVisible()/isExportCsvVisible(): the blotter is below the
    // fold so Cypress's viewport-based :visible check returns false even when
    // the row is fully rendered and interactable.
    return this.rows()
      .then(($rows) => {
        if ($rows.length === 0) return false;
        const css = ($rows.first() as JQuery<HTMLElement>).css("display");
        return css !== "none";
      }) as unknown as Promise<boolean>;
  }

  tableContainsText(text: string): Promise<boolean> {
    return this.tableEl()
      .then(($el) => $el.text().includes(text)) as unknown as Promise<boolean>;
  }
}
