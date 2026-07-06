import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export class RfqsPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** Number of RFQ cards currently rendered. */
  cardCount(): number {
    return this.root.querySelectorAll('[data-testid^="rfq-card-"]').length;
  }

  /** The card's data-state (live / accepted / terminated), or null if absent. */
  cardState(rfqId: number): string | null {
    return this.card(rfqId)?.dataset.state ?? null;
  }

  /** The empty-state message, or null when cards are present. */
  emptyMessage(): string | null {
    const el = within(this.root).queryByText(/no rfqs to show/i);
    return el?.textContent?.trim() ?? null;
  }

  /** Whether any text matching the supplied value is present anywhere in the panel. */
  hasText(text: string | RegExp): boolean {
    return within(this.root).queryByText(text) !== null;
  }

  /** Bank names shown on a card's quote rows, in render order. */
  bankNames(rfqId: number): string[] {
    const card = this.card(rfqId);
    if (!card) return [];
    return [
      ...card.querySelectorAll<HTMLElement>('[data-testid^="rfq-quote-bank-"]'),
    ].map((el) => {
      return el.textContent?.trim() ?? "";
    });
  }

  /** Whether the given quote's row is flagged as the house dealer. */
  isHouseQuote(quoteId: number): boolean {
    return this.quoteRow(quoteId)?.dataset.house === "true";
  }

  /** Whether the given quote's row is flagged best (★). */
  isBestQuote(quoteId: number): boolean {
    return this.quoteRow(quoteId)?.dataset.best === "true";
  }

  /** Whether an ACCEPT button is rendered for the given quote. */
  canAccept(quoteId: number): boolean {
    return this.acceptButton(quoteId) !== null;
  }

  /** Click a quote's ACCEPT button. */
  async accept(quoteId: number): Promise<void> {
    const btn = this.acceptButton(quoteId);
    if (!btn) throw new Error(`No accept button for quote ${quoteId}`);
    await this.user.click(btn);
  }

  /** Click a live card's CANCEL button. */
  async cancel(rfqId: number): Promise<void> {
    const btn = this.root.querySelector<HTMLElement>(
      `[data-testid="rfq-cancel-${rfqId}"]`,
    );
    if (!btn) throw new Error(`No cancel button for rfq ${rfqId}`);
    await this.user.click(btn);
  }

  /** Whether the given card renders a remove control (terminated cards only). */
  hasRemoveControl(rfqId: number): boolean {
    return (
      this.root.querySelector(`[data-testid="rfq-remove-${rfqId}"]`) !== null
    );
  }

  /** Click a terminated card's remove control. */
  async remove(rfqId: number): Promise<void> {
    const btn = this.root.querySelector<HTMLElement>(
      `[data-testid="rfq-remove-${rfqId}"]`,
    );
    if (!btn) throw new Error(`No remove control for rfq ${rfqId}`);
    await this.user.click(btn);
  }

  /** Quote ids recorded by the faked accept-quote command. */
  acceptedQuoteIds(): readonly number[] {
    return this.commandLog().acceptQuote;
  }

  /** RFQ ids recorded by the faked cancel-rfq command. */
  cancelledRfqIds(): readonly number[] {
    return this.commandLog().cancelRfq;
  }

  private card(rfqId: number): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(
      `[data-testid="rfq-card-${rfqId}"]`,
    );
  }

  private quoteRow(quoteId: number): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(
      `[data-testid="rfq-quote-${quoteId}"]`,
    );
  }

  private acceptButton(quoteId: number): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(
      `[data-testid="rfq-quote-accept-${quoteId}"]`,
    );
  }
}
