import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Dealer, Quote } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface QuoteCardProps {
  quote: Quote;
  dealer: Dealer | undefined;
  onAccept?: (quoteId: number) => void;
}

export class QuoteCardPage extends MountedComponent<QuoteCardProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  /** The dealer label shown on the card. */
  dealerLabel(): string {
    // The dealer name is the first muted line; query by either name or fallback.
    return this.root.querySelector("span")?.textContent?.trim() ?? "";
  }

  /** The price / status text shown on the card. */
  valueText(): string {
    const spans = this.root.querySelectorAll("span");
    return spans[1]?.textContent?.trim() ?? "";
  }

  /** Whether an Accept button is present. */
  canAccept(): boolean {
    return this.q().queryByRole("button", { name: /accept/i }) !== null;
  }

  /** Click the Accept button. */
  async accept(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /accept/i }));
  }
}
