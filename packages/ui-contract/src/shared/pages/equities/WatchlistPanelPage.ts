import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

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

  /** A row element's symbol, read off its OWN `data-testid` rather than
   * `data-watch-sym` — Phase 4 Task 5 moved that attribute to `.rowWrapper`
   * under dockview (see WatchlistRow.tsx's doc note), so it's no longer on
   * this element there; the testid (`watch-row-<symbol>`), unlike
   * `data-watch-sym`, is on the row `<button>` in BOTH engine modes.
   * Mirrors `LiveRatesWorkspacePage`'s identical testid-strip idiom. */
  private symbolOf(el: HTMLElement): string {
    return el.getAttribute("data-testid")?.replace(ROW_PREFIX, "") ?? "";
  }

  /** The symbols of the rendered rows, in current sort order. */
  rows(): string[] {
    return this.rowEls().map((el) => {
      return this.symbolOf(el);
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
    return active ? this.symbolOf(active) : null;
  }

  /** Click a row — fires the shared eqWorkspace machine's select(symbol). */
  async select(symbol: string): Promise<void> {
    await this.user.click(this.rowFor(symbol));
  }

  /** The direction of the row's transient tick-pulse overlay ("up" | "down"),
   * or null when no pulse is currently rendered for that symbol. */
  flashDirection(symbol: string): "up" | "down" | null {
    const el = within(this.root).queryByTestId(`watch-flash-${symbol}`);

    if (!el) {
      return null;
    }

    return el.getAttribute("data-up") === "true" ? "up" : "down";
  }

  /** The row's "open chart in a new panel" button (Phase 4 Task 5),
   * dockview-engine-only — absent from the DOM entirely under in-house. */
  private openChartButton(symbol: string): HTMLElement | null {
    return within(this.root).queryByTestId(`watch-open-chart-${symbol}`);
  }

  /** True when the row renders an open-chart button at all — false under the
   * in-house engine, where the affordance has no DOM presence. */
  hasOpenChartButton(symbol: string): boolean {
    return this.openChartButton(symbol) !== null;
  }

  /** The button's accessible name (aria-label), or null when the row has no
   * open-chart button (see `hasOpenChartButton`). */
  openChartButtonLabel(symbol: string): string | null {
    return this.openChartButton(symbol)?.getAttribute("aria-label") ?? null;
  }

  /** True when the symbol's open-chart button is aria-disabled (already has
   * an instance, or the per-tab cap is reached) — false when the button is
   * absent (see `hasOpenChartButton`) or not disabled. */
  chartButtonDisabled(symbol: string): boolean {
    return (
      this.openChartButton(symbol)?.getAttribute("aria-disabled") === "true"
    );
  }

  /** Clicks the row's open-chart button — a SIBLING of the row's own button
   * (see WatchlistRow.tsx's doc note on why they can't nest), so this can
   * never also select the row. A no-op when the button is disabled (the
   * browser refuses to dispatch the click to a natively `disabled` button at
   * all) or absent (no row button at all under in-house). */
  async clickOpenChart(symbol: string): Promise<void> {
    const button = this.openChartButton(symbol);

    if (button) {
      await this.user.click(button);
    }
  }

  /** The exact element set `useRankGlide` queries via `[data-watch-sym]` —
   * one per row, and the node its `translateY` glide actually animates. In
   * in-house mode this is each row's own `<button>`; under dockview it's
   * each `.rowWrapper` (Phase 4 Task 5's chart-button sibling wrapper — see
   * WatchlistRow.tsx's doc note), so the glide carries the whole row,
   * chart button included, instead of leaving it behind. */
  rankGlideTargets(): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>("[data-watch-sym]"),
    );
  }
}
