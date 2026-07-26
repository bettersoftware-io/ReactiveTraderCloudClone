import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";

const TAB_PREFIX = "instrument-tab-";

/**
 * Page object for EqChartHead — the panel headControls composing the
 * instrument tabs (real eqWorkspace machine) and timeframe pills.
 */
export class EqChartHeadPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private tabEls(): HTMLElement[] {
    return within(this.root).queryAllByTestId(new RegExp(`^${TAB_PREFIX}`));
  }

  tabs(): string[] {
    return this.tabEls().map((el) => {
      return el.getAttribute("data-testid")?.replace(TAB_PREFIX, "") ?? "";
    });
  }

  activeTab(): string | null {
    const active = this.tabEls().find((el) => {
      return el.getAttribute("data-active") === "true";
    });
    return active?.getAttribute("data-testid")?.replace(TAB_PREFIX, "") ?? null;
  }

  activeTf(): string | null {
    const active = within(this.root)
      .queryAllByRole("button")
      .find((el) => {
        return (
          el.hasAttribute("data-tf") &&
          el.getAttribute("data-active") === "true"
        );
      });
    return active?.getAttribute("data-tf") ?? null;
  }

  async selectTab(symbol: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`${TAB_PREFIX}${symbol}`),
    );
  }

  async closeTab(symbol: string): Promise<void> {
    const tab = within(this.root).getByTestId(`${TAB_PREFIX}${symbol}`);
    await this.user.click(within(tab).getByText("✕"));
  }

  async selectTimeframe(tf: string): Promise<void> {
    await this.user.click(within(this.root).getByRole("button", { name: tf }));
  }

  /** The currently-active chart-type pill's `data-kind` (candles/line/area). */
  activeChartType(): EqChartType | null {
    const active = within(this.root)
      .queryAllByTestId("chart-type-pill")
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return (active?.getAttribute("data-kind") as EqChartType | null) ?? null;
  }

  /** Clicks the chart-type pill for the given kind — drives the real
   * eqWorkspace machine's setChartType intent. */
  async selectChartType(kind: EqChartType): Promise<void> {
    await this.user.click(this.pillFor("chart-type-pill", "data-kind", kind));
  }

  /** Every indicator id whose pill is currently active. */
  activeIndicators(): EqIndicatorId[] {
    return within(this.root)
      .queryAllByTestId("chart-indicator-pill")
      .filter((el) => {
        return el.getAttribute("data-active") === "true";
      })
      .map((el) => {
        return el.getAttribute("data-ind") as EqIndicatorId;
      });
  }

  /** Clicks the indicator pill for the given id — drives the real
   * eqWorkspace machine's toggleIndicator intent. */
  async toggleIndicator(id: EqIndicatorId): Promise<void> {
    await this.user.click(this.pillFor("chart-indicator-pill", "data-ind", id));
  }

  /** Finds the single pill of `testid` whose `attr` matches `value` (e.g. the
   * "line" chart-type-pill, or the "sma20" chart-indicator-pill). */
  private pillFor(testid: string, attr: string, value: string): HTMLElement {
    const el = within(this.root)
      .queryAllByTestId(testid)
      .find((candidate) => {
        return candidate.getAttribute(attr) === value;
      });

    if (!el) {
      throw new Error(`No ${testid} with ${attr}="${value}"`);
    }

    return el;
  }
}
