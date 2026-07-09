import { fireEvent, within } from "@testing-library/dom";
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

  /** The card's data-anim ("enter" / "exit" / "none"), or null if absent. */
  cardAnim(rfqId: number): string | null {
    return this.card(rfqId)?.dataset.anim ?? null;
  }

  /** The "N secs" countdown caption on a live card. */
  secsCaption(rfqId: number): string | null {
    const el = this.card(rfqId)?.querySelector<HTMLElement>('[class*="secs"]');
    return el?.textContent?.trim() ?? null;
  }

  /** The bar's mount-time drain-animation duration, e.g. "10000ms". */
  barDuration(rfqId: number): string {
    const fill =
      this.card(rfqId)?.querySelector<HTMLElement>('[class*="barFill"]');
    return fill?.style.getPropertyValue("--bar-duration").trim() ?? "";
  }

  /** The bar's mount-time drain fast-forward (negative delay), e.g. "-5000ms". */
  barDelay(rfqId: number): string {
    const fill =
      this.card(rfqId)?.querySelector<HTMLElement>('[class*="barFill"]');
    return fill?.style.getPropertyValue("--bar-delay").trim() ?? "";
  }

  /** The card root's --card-delay custom property, e.g. "45ms". */
  cardDelay(rfqId: number): string {
    return (
      this.card(rfqId)?.style.getPropertyValue("--card-delay").trim() ?? ""
    );
  }

  /** Fire the native event React actually listens for on `onAnimationEnd` in
   * THIS jsdom, simulating a card's CSS entrance/exit keyframe completing
   * (jsdom never runs real CSS animations). react-dom feature-detects the
   * animationend event name at startup and falls back to the WebKit-prefixed
   * native name whenever `window.AnimationEvent` is undefined — true in this
   * repo's jsdom (confirmed empirically: it implements neither the
   * constructor nor dispatches a bare "animationend"). @testing-library/dom's
   * `fireEvent.animationEnd` fires the unprefixed name and is silently
   * ignored here, so dispatch the vendor-prefixed one directly instead.
   * RfqCard's handler doesn't inspect animationName — it just reports
   * whichever of "enter"/"exit" is CURRENTLY selected — so a bare event with
   * no init is enough. */
  fireCardAnimationEnd(rfqId: number): void {
    const card = this.card(rfqId);
    if (!card) throw new Error(`No rendered card for rfq ${rfqId}`);
    fireEvent(
      card,
      new Event("webkitAnimationEnd", { bubbles: true, cancelable: false }),
    );
  }

  /** Fire the native "animationcancel" event RfqCard listens for via a plain
   * `addEventListener` (final review M-a) — e.g. a mid-flight
   * prefers-reduced-motion flip cancelling the exit keyframe. Unlike
   * animationend above, this bypasses React's synthetic event system
   * entirely (react-dom has no onAnimationCancel prop to feature-detect a
   * vendor prefix for), so the bare unprefixed event name is enough. */
  fireCardAnimationCancel(rfqId: number): void {
    const card = this.card(rfqId);
    if (!card) throw new Error(`No rendered card for rfq ${rfqId}`);
    fireEvent(
      card,
      new Event("animationcancel", { bubbles: true, cancelable: false }),
    );
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
