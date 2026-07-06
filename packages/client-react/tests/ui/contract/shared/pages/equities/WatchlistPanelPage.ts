import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

const ROW_PREFIX = "watch-row-";

/**
 * Page object for the new prototype-styled WatchlistPanel (right-rail rows,
 * sortable via the shared eqWatchlistSort preference, selection via the
 * shared eqWorkspace machine). Not yet registered in the default layout
 * (Task 6) — specs mount it directly with `mount()`/`mountWith()`.
 */
export class WatchlistPanelPage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private rowEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${ROW_PREFIX}`));
  }

  private rowFor(symbol: string): HTMLElement {
    return within(this.root).getByTestId(`${ROW_PREFIX}${symbol}`);
  }

  /** The symbols of the rendered rows, in current sort order. */
  rows(): string[] {
    return this.rowEls().map((el) => {
      return el.getAttribute("data-watch-sym") ?? "";
    });
  }

  /** True when the empty-state placeholder is shown (no instruments). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/no instruments/i) !== null;
  }

  /** The symbol of the selected row, or null when none is selected. */
  selectedSymbol(): string | null {
    const active = this.rowEls().find((el) => {
      return el.getAttribute("data-selected") === "true";
    });
    return active?.getAttribute("data-watch-sym") ?? null;
  }

  /** Click a row — fires the shared eqWorkspace machine's select(symbol). */
  async select(symbol: string): Promise<void> {
    await this.user.click(this.rowFor(symbol));
  }

  /** The direction of the row's transient tick-pulse overlay ("up" | "down"),
   * or null when no pulse is currently rendered for that symbol. */
  flashDirection(symbol: string): "up" | "down" | null {
    const el = within(this.root).queryByTestId(`watch-flash-${symbol}`);
    if (!el) return null;
    return el.getAttribute("data-up") === "true" ? "up" : "down";
  }
}
