import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Instrument, Quote, QuoteRequest, Rfq } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

export class TradeTicketPage extends MountedComponent<TradeTicketProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** The instrument title (or fallback) line. */
  title(): string {
    // outer ticket → title block → name div (first leaf).
    return (
      this.root
        .querySelector(":scope > div > div > div")
        ?.textContent?.trim() ?? ""
    );
  }

  /** Whether the price input + Submit/Pass actions are shown (active ticket). */
  isActive(): boolean {
    return this.q().queryByPlaceholderText(/price/i) !== null;
  }

  /** Whether any text matching the supplied value is present. */
  hasText(text: string | RegExp): boolean {
    return this.q().queryByText(text) !== null;
  }

  /** Type a price into the active ticket's input. */
  async setPrice(value: string): Promise<void> {
    const input = this.q().getByPlaceholderText(/price/i);
    await this.user.clear(input);
    if (value) await this.user.type(input, value);
  }

  /** Whether the Submit button is disabled. */
  isSubmitDisabled(): boolean {
    return (
      this.q().getByRole("button", { name: /^submit$/i }) as HTMLButtonElement
    ).disabled;
  }

  /** Click Submit to send the quote price. */
  async submit(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /^submit$/i }));
  }

  /** Click Pass to decline. */
  async pass(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /^pass$/i }));
  }

  /** Requests recorded by the faked quote-RFQ command. */
  quoteRfqInputs(): readonly QuoteRequest[] {
    return this.commandLog().quoteRfq;
  }

  /** Quote ids recorded by the faked pass-quote command. */
  passedQuoteIds(): readonly number[] {
    return this.commandLog().passQuote;
  }
}
