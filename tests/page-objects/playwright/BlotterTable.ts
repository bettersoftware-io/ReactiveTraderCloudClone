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
  private firstRow() {
    return this.rows().first();
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
  async clickFirstHeader(): Promise<void> {
    await this.locator().locator("th").first().click();
  }
  async fillQuickFilter(text: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.blotter.quickFilter).fill(text);
  }
  async clearQuickFilter(): Promise<void> {
    await this.page.getByTestId(TESTIDS.blotter.quickFilter).clear();
  }
  async isExportCsvVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.blotter.exportCsv).isVisible();
  }
  async exportCsvText(): Promise<string> {
    return (await this.page.getByTestId(TESTIDS.blotter.exportCsv).textContent()) ?? "";
  }
  async hoverFirstRow(): Promise<void> {
    await this.firstRow().hover();
  }
  async firstRowBackgroundColor(): Promise<string> {
    return await this.firstRow().evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
  }
  async isFirstRowVisible(): Promise<boolean> {
    return await this.firstRow().isVisible();
  }
  async tableContainsText(text: string): Promise<boolean> {
    const content = await this.locator().textContent() ?? "";
    return content.includes(text);
  }
}
