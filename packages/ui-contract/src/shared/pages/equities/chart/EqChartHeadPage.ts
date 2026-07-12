import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

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
}
