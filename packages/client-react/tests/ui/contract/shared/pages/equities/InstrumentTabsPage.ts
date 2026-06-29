import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the InstrumentTabs component reads (selection + a select callback). */
export interface InstrumentTabsProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

const TAB_PREFIX = "instrument-tab-";

/**
 * Page object for the equity InstrumentTabs. Dumb nav: reads its tabs from
 * `useWatchlist()` and paints the selected symbol via `data-active`.
 */
export class InstrumentTabsPage extends MountedComponent<InstrumentTabsProps> {
  private readonly user: UserEvent = userEvent.setup();

  private tabEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${TAB_PREFIX}`));
  }

  /** The symbols of the rendered tabs, in order. */
  tabs(): string[] {
    return this.tabEls().map((el) => {
      return el.getAttribute("data-testid")?.replace(TAB_PREFIX, "") ?? "";
    });
  }

  /** The active (selected) tab's symbol, or null when none is active. */
  activeSymbol(): string | null {
    const active = this.tabEls().find((el) => {
      return el.getAttribute("data-active") === "true";
    });
    return active?.getAttribute("data-testid")?.replace(TAB_PREFIX, "") ?? null;
  }

  /** Click a tab → fires the onSelect prop with its symbol. */
  async select(symbol: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`${TAB_PREFIX}${symbol}`),
    );
  }
}
