import type { Page } from "@playwright/test";
import type { BlotterTablePO } from "../contracts/BlotterTable";

export class PlaywrightBlotterTable implements BlotterTablePO {
  constructor(private readonly page: Page) {}
  waitVisible(_t: number): Promise<void> { throw notYet("BlotterTable.waitVisible"); }
  isVisible(): Promise<boolean> { throw notYet("BlotterTable.isVisible"); }
  rowCount(): Promise<number> { throw notYet("BlotterTable.rowCount"); }
  clickFirstHeader(): Promise<void> { throw notYet("BlotterTable.clickFirstHeader"); }
  fillQuickFilter(_t: string): Promise<void> { throw notYet("BlotterTable.fillQuickFilter"); }
  clearQuickFilter(): Promise<void> { throw notYet("BlotterTable.clearQuickFilter"); }
  isExportCsvVisible(): Promise<boolean> { throw notYet("BlotterTable.isExportCsvVisible"); }
  exportCsvText(): Promise<string> { throw notYet("BlotterTable.exportCsvText"); }
  hoverFirstRow(): Promise<void> { throw notYet("BlotterTable.hoverFirstRow"); }
  firstRowBackgroundColor(): Promise<string> { throw notYet("BlotterTable.firstRowBackgroundColor"); }
  isFirstRowVisible(): Promise<boolean> { throw notYet("BlotterTable.isFirstRowVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
