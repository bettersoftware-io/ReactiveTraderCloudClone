import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { RfqState, RfqTileIntents } from "@rtc/client-core";
import type { CurrencyPair, Direction, Price } from "@rtc/domain";

/** Controllable double for the rfq machine result the component consumes:
 * current state plus the RFQ intents (accept returns void — the quote is
 * captured from state.quote by the component before accepting). */
export type RfqStateLike = { state: RfqState } & RfqTileIntents;

export interface TileRfqProps {
  pair: CurrencyPair;
  rfqState: RfqStateLike;
  onExecute: (direction: Direction, price: Price, notional: number) => void;
  notional: number;
}

export class TileRfqPage extends MountedComponent<TileRfqProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** True when the root renders no content (the null branch). */
  isEmpty(): boolean {
    return this.root.textContent?.trim() === "";
  }

  text(): string {
    return this.root.textContent?.trim() ?? "";
  }

  hasButton(name: RegExp): boolean {
    return this.q().queryByRole("button", { name }) !== null;
  }

  async click(name: RegExp): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name }));
  }

  /** The countdown caption, when a quote is shown. */
  countdownCaption(): string | null {
    return (
      this.q()
        .queryByText(/remaining/i)
        ?.textContent?.trim() ?? null
    );
  }
}
