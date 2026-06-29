import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the Watchlist component reads (selection + a select callback). */
export interface WatchlistProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

const ROW_PREFIX = "watchlist-row-";

/**
 * Page object for the equity Watchlist. The list is dumb: it reads its rows from
 * `useWatchlist()` and each row's quote from `useEquityQuote(symbol)`, mapping
 * change% to a `--heat` custom property and an up/down `data-direction`. Specs
 * seed the watchlist + quotes via `mount(..., { equities: { watchlist, quotes }})`.
 */
export class WatchlistPage extends MountedComponent<WatchlistProps> {
  private readonly user: UserEvent = userEvent.setup();

  private rowEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`));
  }

  private rowFor(symbol: string): HTMLElement {
    return within(this.root).getByTestId(`${ROW_PREFIX}${symbol}`);
  }

  /** The symbols of the rendered rows, in order. */
  rows(): string[] {
    return this.rowEls().map((el) => {
      return el.getAttribute("data-testid")?.replace(ROW_PREFIX, "") ?? "";
    });
  }

  /** True when the empty-state placeholder is shown (no instruments). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no instruments/i) !== null;
  }

  /** The `--heat` value [0, 1] a row paints for its change%. */
  heatOf(symbol: string): number {
    const raw = this.rowFor(symbol).style.getPropertyValue("--heat").trim();
    return raw === "" ? 0 : Number(raw);
  }

  /** The up/down direction a row paints for its change%. */
  directionOf(symbol: string): string | null {
    return this.rowFor(symbol).getAttribute("data-direction");
  }

  /** The symbol of the active (selected) row, or null when none is active. */
  activeSymbol(): string | null {
    const active = this.rowEls().find((el) => {
      return el.getAttribute("data-active") === "true";
    });
    return active?.getAttribute("data-testid")?.replace(ROW_PREFIX, "") ?? null;
  }

  /** Click a row → fires the onSelect prop with its symbol. */
  async select(symbol: string): Promise<void> {
    await this.user.click(this.rowFor(symbol));
  }
}
