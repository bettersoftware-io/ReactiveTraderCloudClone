import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for the PositionsPanel feature root. It is hook-driven (reads
 * `useAnalytics`), so it carries no props.
 */
export class PositionsPanelPage extends MountedComponent<
  Record<string, never>
> {
  /** True once the panel (rather than the loading placeholder) is showing. */
  isLoaded(): boolean {
    return within(this.root).queryByTestId("positions-panel") !== null;
  }

  /** The loading-placeholder text, or null once data has arrived. */
  loadingMessage(): string | null {
    if (this.isLoaded()) {
      return null;
    }

    const el = within(this.root).queryByText(/loading positions/i);
    return el?.textContent?.trim() ?? null;
  }

  /** The "Net Exposure" section label text, or "" if not rendered. */
  sectionLabel(): string {
    return (
      within(this.root)
        .queryByText(/net exposure/i)
        ?.textContent?.trim() ?? ""
    );
  }

  /** Currency codes with a rendered exposure bubble, in DOM order. */
  bubbleCurrencies(): string[] {
    return within(this.root)
      .queryAllByTestId(/^exposure-bubble-/)
      .map((el) => {
        return (
          el.getAttribute("data-testid")?.replace("exposure-bubble-", "") ?? ""
        );
      });
  }

  /** The formatted amount text on a currency's bubble, e.g. "+15.2M". */
  bubbleAmountText(currency: string): string | null {
    const el = within(this.root).queryByTestId(`exposure-bubble-${currency}`);
    return el?.querySelector("span:last-child")?.textContent?.trim() ?? null;
  }

  /** The `data-sign` ("pos"/"neg") of a currency's bubble. */
  bubbleSign(currency: string): string | null {
    const el = within(this.root).queryByTestId(`exposure-bubble-${currency}`);
    return el?.getAttribute("data-sign") ?? null;
  }

  /** The bubble diameter in pixels, read from its `--bubble-size` custom property. */
  bubbleDiameter(currency: string): number {
    const el = within(this.root).getByTestId(`exposure-bubble-${currency}`);
    const raw = (el as HTMLElement).style.getPropertyValue("--bubble-size");
    return Number.parseFloat(raw);
  }

  /** Currency codes with a rendered ladder row, in DOM order. */
  ladderCurrencies(): string[] {
    return within(this.root)
      .queryAllByTestId(/^exposure-row-/)
      .map((el) => {
        return (
          el.getAttribute("data-testid")?.replace("exposure-row-", "") ?? ""
        );
      });
  }

  /** The formatted amount text on a currency's ladder row, e.g. "+15.2M". */
  ladderAmountText(currency: string): string | null {
    const el = within(this.root).queryByTestId(`exposure-row-${currency}`);
    return el?.querySelector("span:last-child")?.textContent?.trim() ?? null;
  }

  /** The `data-sign` ("pos"/"neg") of a currency's ladder amount. */
  ladderSign(currency: string): string | null {
    const el = within(this.root).queryByTestId(`exposure-row-${currency}`);
    return el?.querySelector("[data-sign]")?.getAttribute("data-sign") ?? null;
  }

  /** True when the stale overlay ("Reconnecting...") is visible. */
  isStale(): boolean {
    return within(this.root).queryByText(/reconnecting/i) !== null;
  }
}
