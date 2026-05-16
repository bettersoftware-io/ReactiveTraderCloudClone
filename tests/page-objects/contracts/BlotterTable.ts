export interface BlotterTablePO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;
  rowCount(): Promise<number>;
  clickFirstHeader(): Promise<void>;
  fillQuickFilter(text: string): Promise<void>;
  clearQuickFilter(): Promise<void>;
  isExportCsvVisible(): Promise<boolean>;
  exportCsvText(): Promise<string>;
  hoverFirstRow(): Promise<void>;
  firstRowBackgroundColor(): Promise<string>;
  isFirstRowVisible(): Promise<boolean>;
  /** Return true if the blotter table's text content contains the given string. */
  tableContainsText(text: string): Promise<boolean>;
}
