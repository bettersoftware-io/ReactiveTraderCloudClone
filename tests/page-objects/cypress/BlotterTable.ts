import type { BlotterTablePO } from "../contracts/BlotterTable";

function notYet(name: string): never {
  throw new Error(`CypressBlotterTable.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressBlotterTable implements BlotterTablePO {
  waitVisible(timeoutMs: number): Promise<void> { notYet("waitVisible"); }
  isVisible(): Promise<boolean> { notYet("isVisible"); }
  rowCount(): Promise<number> { notYet("rowCount"); }
  clickFirstHeader(): Promise<void> { notYet("clickFirstHeader"); }
  fillQuickFilter(text: string): Promise<void> { notYet("fillQuickFilter"); }
  clearQuickFilter(): Promise<void> { notYet("clearQuickFilter"); }
  isExportCsvVisible(): Promise<boolean> { notYet("isExportCsvVisible"); }
  exportCsvText(): Promise<string> { notYet("exportCsvText"); }
  hoverFirstRow(): Promise<void> { notYet("hoverFirstRow"); }
  firstRowBackgroundColor(): Promise<string> { notYet("firstRowBackgroundColor"); }
  isFirstRowVisible(): Promise<boolean> { notYet("isFirstRowVisible"); }
}
