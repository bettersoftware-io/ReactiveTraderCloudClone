import { expect, type Page } from "@playwright/test";
import type { BlotterTablePO } from "../contracts/BlotterTable";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightBlotterTable implements BlotterTablePO {
  constructor(private readonly page: Page) {}

  private locator() {
    return this.page.getByTestId(TESTIDS.blotter.table);
  }
  private rows() {
    return this.locator().locator("tbody tr");
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async rowCount(): Promise<number> {
    return await this.rows().count();
  }
  async clickFirstHeader(): Promise<void> { throw notYet("BlotterTable.clickFirstHeader"); }
  async fillQuickFilter(_t: string): Promise<void> { throw notYet("BlotterTable.fillQuickFilter"); }
  async clearQuickFilter(): Promise<void> { throw notYet("BlotterTable.clearQuickFilter"); }
  async isExportCsvVisible(): Promise<boolean> { throw notYet("BlotterTable.isExportCsvVisible"); }
  async exportCsvText(): Promise<string> { throw notYet("BlotterTable.exportCsvText"); }
  async hoverFirstRow(): Promise<void> { throw notYet("BlotterTable.hoverFirstRow"); }
  async firstRowBackgroundColor(): Promise<string> { throw notYet("BlotterTable.firstRowBackgroundColor"); }
  async isFirstRowVisible(): Promise<boolean> { throw notYet("BlotterTable.isFirstRowVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
