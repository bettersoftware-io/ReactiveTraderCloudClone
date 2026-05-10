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
    return cy.get("body").then(($body) => {
      const found = $body.find(`[data-testid="${TESTIDS.blotter.exportCsv}"]`);
      return found.length > 0 && found.is(":visible");
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
    return this.rows()
      .then(($rows) => $rows.length > 0 && $rows.first().is(":visible")) as unknown as Promise<boolean>;
  }
}
