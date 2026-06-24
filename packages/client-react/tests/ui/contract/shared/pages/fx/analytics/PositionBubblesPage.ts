import { within } from "@testing-library/dom";

import type { CurrencyPairPosition } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface PositionBubblesProps {
  positions: readonly CurrencyPairPosition[];
}

/** Page object for the PositionBubbles d3 chart. */
export class PositionBubblesPage extends MountedComponent<PositionBubblesProps> {
  /** The currency codes shown as bubble labels, sorted. */
  currencyLabels(): string[] {
    return within(this.root)
      .queryAllByTestId(/^positions-label-/)
      .map((el) => {
        return el.textContent?.trim() ?? "";
      })
      .filter((t) => {
        return t.length > 0;
      })
      .sort();
  }

  /** The data-sign ("pos"/"neg") of a currency's bubble group. */
  signFor(currency: string): string | null {
    const label = within(this.root).queryByTestId(
      `positions-label-${currency}`,
    );
    const group = label?.closest("g.node");
    return group?.getAttribute("data-sign") ?? null;
  }

  /** The bubble radius (circle r attr) for a currency, as a number. */
  radiusFor(currency: string): number {
    const label = within(this.root).queryByTestId(
      `positions-label-${currency}`,
    );
    const circle = label?.closest("g.node")?.querySelector("circle");
    return Number(circle?.getAttribute("r") ?? "0");
  }

  /** The tooltip text after hovering a currency's bubble, e.g. "EUR -2,000,000". */
  tooltipAfterHover(currency: string): string {
    const label = within(this.root).getByTestId(`positions-label-${currency}`);
    const group = label.closest("g.node");
    group?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const tip = within(this.root).queryByTestId("tooltip");
    return tip?.textContent?.trim() ?? "";
  }
}
