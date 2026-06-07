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
  /**
   * Assert, retrying up to `timeoutMs`, that the blotter table's text content
   * contains the given string. The assertion must run in the driver's own
   * retry/wait machinery (Cypress command queue / Playwright expect) — not via a
   * fixed sleep + JS-side check, which is flaky and, under the Cypress cucumber
   * shim, leaks a failure as an unhandled rejection onto a later scenario.
   */
  expectContainsText(text: string, timeoutMs: number): Promise<void>;
}
