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
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.table}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }

  isVisible(): Promise<boolean> {
    // Playwright's isVisible() returns true even for below-fold elements.
    // Cypress considers off-viewport elements "not visible". Match Playwright's
    // behavior by checking for DOM presence (not CSS hidden) rather than strict
    // Cypress viewport-visibility.
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.blotter.table}"]`);
        if (found.length === 0) {
          resolve(false);
          return;
        }
        const css = (found as JQuery<HTMLElement>).css("display");
        resolve(css !== "none");
      });
    });
  }

  rowCount(): Promise<number> {
    return new Promise<number>((resolve) => {
      this.rows().then(($rows) => resolve($rows.length));
    });
  }

  clickFirstHeader(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tableEl()
        .find("th")
        .first()
        .click()
        .then(() => resolve());
    });
  }

  fillQuickFilter(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`)
        .clear()
        .type(text)
        .then(() => resolve());
    });
  }

  clearQuickFilter(): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`)
        .clear()
        .then(() => resolve());
    });
  }

  isExportCsvVisible(): Promise<boolean> {
    // Use css("display") !== "none" instead of jQuery :visible, because
    // Cypress's :visible requires the element to be within the viewport —
    // but the blotter sits below the fold. This matches the same pattern
    // used in isVisible() for the blotter table itself.
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.blotter.exportCsv}"]`);
        if (found.length === 0) {
          resolve(false);
          return;
        }
        const css = (found as JQuery<HTMLElement>).css("display");
        resolve(css !== "none");
      });
    });
  }

  exportCsvText(): Promise<string> {
    return new Promise<string>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.exportCsv}"]`)
        .then(($el) => resolve($el.text()));
    });
  }

  hoverFirstRow(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstRow()
        .trigger("mouseover")
        .then(() => resolve());
    });
  }

  firstRowBackgroundColor(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.firstRow()
        .then(($el) => resolve(getComputedStyle($el[0]).backgroundColor));
    });
  }

  isFirstRowVisible(): Promise<boolean> {
    // Use css("display") !== "none" instead of jQuery :visible for the same
    // reason as isVisible()/isExportCsvVisible(): the blotter is below the
    // fold so Cypress's viewport-based :visible check returns false even when
    // the row is fully rendered and interactable.
    return new Promise<boolean>((resolve) => {
      this.rows().then(($rows) => {
        if ($rows.length === 0) {
          resolve(false);
          return;
        }
        const css = ($rows.first() as JQuery<HTMLElement>).css("display");
        resolve(css !== "none");
      });
    });
  }
}
