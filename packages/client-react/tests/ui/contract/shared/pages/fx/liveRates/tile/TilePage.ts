import { fireEvent, within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CurrencyPair, ExecuteTradeInput } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

export class TilePage extends MountedComponent<TileProps> {
  private readonly user: UserEvent = userEvent.setup({
    advanceTimers: () => {},
  });

  private q() {
    return within(this.root);
  }

  tile(symbol: string): HTMLElement {
    return this.q().getByTestId(`tile-${symbol}`);
  }

  /** True when the tile shows its "Loading..." price placeholder. */
  isPriceLoading(): boolean {
    return this.q().queryByText(/^Loading\.\.\.$/) !== null;
  }

  headerText(): string {
    // Header is the first flex row inside the tile; read base/terms spans.
    const spans = [...this.root.querySelectorAll("span")];
    return spans
      .slice(0, 3)
      .map((s) => s.textContent?.trim() ?? "")
      .join("");
  }

  hasChart(): boolean {
    return this.root.querySelector("svg") !== null;
  }

  hasPriceButtons(): boolean {
    return this.q().queryAllByText(/SELL|BUY/).length >= 2;
  }

  spreadText(): string | null {
    // SpreadDisplay is a small centred div; find by its numeric pattern is hard,
    // so locate via the price area: the spread sits between price buttons and
    // the execution controls. Expose the raw price.spread by data: read the
    // text node that matches a decimal.
    const candidate = [...this.root.querySelectorAll("div")].find(
      (d) =>
        d.children.length === 0 &&
        /^\d+(\.\d+)?$/.test(d.textContent?.trim() ?? ""),
    );
    return candidate?.textContent?.trim() ?? null;
  }

  // ---- Execution (non-RFQ) controls ----
  hasExecutionButtons(): boolean {
    return this.q().queryByTestId("sell-btn") !== null;
  }
  isSellDisabled(): boolean {
    return (this.q().getByTestId("sell-btn") as HTMLButtonElement).disabled;
  }
  isBuyDisabled(): boolean {
    return (this.q().getByTestId("buy-btn") as HTMLButtonElement).disabled;
  }
  async clickSell(): Promise<void> {
    await this.user.click(this.q().getByTestId("sell-btn"));
  }
  async clickBuy(): Promise<void> {
    await this.user.click(this.q().getByTestId("buy-btn"));
  }

  // ---- Notional ----
  notionalInput(): HTMLInputElement {
    return this.root.querySelector("input") as HTMLInputElement;
  }
  notionalValue(): string {
    return this.notionalInput().value;
  }
  isNotionalDisabled(): boolean {
    return this.notionalInput().disabled;
  }
  /** Replace the notional input contents with a literal value. */
  setNotional(value: string): void {
    const input = this.notionalInput();
    fireEvent.change(input, { target: { value } });
  }
  async typeNotional(text: string): Promise<void> {
    await this.user.clear(this.notionalInput());
    await this.user.type(this.notionalInput(), text);
  }
  hasNotionalReset(): boolean {
    return this.q().queryByTitle(/reset to default/i) !== null;
  }
  async resetNotional(): Promise<void> {
    await this.user.click(this.q().getByTitle(/reset to default/i));
  }
  notionalError(): string | null {
    const err = this.root.querySelector("[data-testid='notional-error']");
    return err?.textContent?.trim() ?? null;
  }

  // ---- RFQ ----
  hasInitiateRfq(): boolean {
    return this.q().queryByRole("button", { name: /initiate rfq/i }) !== null;
  }
  async clickInitiateRfq(): Promise<void> {
    await this.user.click(
      this.q().getByRole("button", { name: /initiate rfq/i }),
    );
  }
  rfqText(): string {
    return this.root.textContent ?? "";
  }
  /** Find an RFQ quote button by its exact label text (e.g. "Buy 1.09250"). */
  private rfqButton(label: string): HTMLButtonElement | null {
    return (
      [...this.root.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === label,
      ) ?? null
    );
  }
  async clickRfqButton(label: string): Promise<void> {
    const btn = this.rfqButton(label);
    if (!btn) throw new Error(`No RFQ button labelled "${label}"`);
    await this.user.click(btn);
  }
  hasRfqButton(label: string): boolean {
    return this.rfqButton(label) !== null;
  }

  // ---- Confirmation overlay ----
  hasConfirmation(): boolean {
    return this.q().queryByTestId("trade-confirmation") !== null;
  }
  confirmationText(): string {
    return (
      this.q().queryByTestId("trade-confirmation")?.textContent?.trim() ?? ""
    );
  }
  async clickConfirmation(): Promise<void> {
    await this.user.click(this.q().getByTestId("trade-confirmation"));
  }

  // ---- Stale overlay ----
  isStale(): boolean {
    return this.root.querySelector("[data-stale]") !== null;
  }

  // ---- Command log ----
  /** Inputs captured by the faked execute-trade command. */
  executedTrades(): readonly ExecuteTradeInput[] {
    return this.commandLog().executeTrade;
  }
  /** Inputs captured by the faked request-RFQ-quote command. */
  requestedQuotes(): readonly { symbol: string; pipsPosition: number }[] {
    return this.commandLog().requestRfqQuote;
  }
}
