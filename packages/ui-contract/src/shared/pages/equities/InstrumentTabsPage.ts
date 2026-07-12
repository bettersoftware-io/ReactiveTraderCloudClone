import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

const TAB_PREFIX = "instrument-tab-";

/**
 * Page object for the equity InstrumentTabs. Reads/writes the REAL
 * eqWorkspace machine directly (openTabs/sel/select/closeTab) — no props.
 */
export class InstrumentTabsPage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private tabEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${TAB_PREFIX}`));
  }

  /** The symbols of the rendered (open) tabs, in order. */
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

  /** Click a tab → selects it through the real eqWorkspace machine. */
  async select(symbol: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`${TAB_PREFIX}${symbol}`),
    );
  }

  /** Click a tab's close glyph → closes it through the real eqWorkspace machine. */
  async close(symbol: string): Promise<void> {
    const tab = within(this.root).getByTestId(`${TAB_PREFIX}${symbol}`);
    await this.user.click(within(tab).getByText("✕"));
  }
}
