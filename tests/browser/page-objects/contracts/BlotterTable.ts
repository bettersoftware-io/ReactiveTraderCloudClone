export interface BlotterTablePO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;
  rowCount(): Promise<number>;
  clickFirstHeader(): Promise<void>;
  fillQuickFilter(text: string): Promise<void>;
  clearQuickFilter(): Promise<void>;
  isExportCsvVisible(): Promise<boolean>;
  exportCsvText(): Promise<string>;
  /**
   * Click the CSV chip and return the browser's suggested filename for the
   * resulting download, via Playwright's download-event API for blob-URL
   * anchors.
   */
  downloadCsvSuggestedFilename(): Promise<string>;
  hoverFirstRow(): Promise<void>;
  firstRowBackgroundColor(): Promise<string>;
  isFirstRowVisible(): Promise<boolean>;
  /**
   * Assert, retrying up to `timeoutMs`, that the blotter table's text content
   * contains the given string. The assertion must run in Playwright's own
   * `expect` retry/wait machinery — not via a fixed sleep + JS-side check,
   * which is flaky.
   */
  expectContainsText(text: string, timeoutMs: number): Promise<void>;
}
