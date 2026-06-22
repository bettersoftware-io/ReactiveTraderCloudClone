import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CurrencyCategory } from "@rtc/domain";

import { MountedComponent } from "../../../harness/component";

export class LiveRatesPanelPage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  /** The symbols of every rendered tile, in order. */
  tileSymbols(): string[] {
    return [
      ...this.root.querySelectorAll<HTMLElement>("[data-testid^='tile-']"),
    ].map((el) => {
      const testid = el.getAttribute("data-testid");
      if (!testid)
        throw new Error("tile element missing data-testid attribute");
      return testid.replace("tile-", "");
    });
  }

  tileCount(): number {
    return this.root.querySelectorAll("[data-testid^='tile-']").length;
  }

  hasTile(symbol: string): boolean {
    return this.q().queryByTestId(`tile-${symbol}`) !== null;
  }

  /** The loading placeholder text, when no pairs have loaded. */
  loadingMessage(): string | null {
    return (
      this.q()
        .queryByText(/loading currency pairs/i)
        ?.textContent?.trim() ?? null
    );
  }

  async chooseFilter(category: CurrencyCategory): Promise<void> {
    await this.user.click(this.q().getByTestId(`filter-${category}`));
  }

  async toggleView(): Promise<void> {
    await this.user.click(this.q().getByTestId("view-toggle"));
  }

  viewToggleLabel(): string {
    return (this.q().getByTestId("view-toggle").textContent ?? "").trim();
  }

  /** True when at least one tile renders a chart (svg sparkline, chart view). */
  hasAnyChart(): boolean {
    return this.root.querySelector("svg") !== null;
  }
}
