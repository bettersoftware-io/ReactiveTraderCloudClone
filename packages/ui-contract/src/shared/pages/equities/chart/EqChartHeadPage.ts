import { waitFor, within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type {
  EqChartType,
  EqDrawTool,
  EqIndicatorId,
  EqPaneId,
} from "@rtc/client-core";

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

  /** Every pane id whose pill is currently active — mirrors
   * {@link activeIndicators} for the RSI/MACD indicator panes (a separate
   * active set, independent of `indicators`). */
  activePanes(): EqPaneId[] {
    return within(this.root)
      .queryAllByTestId("chart-pane-pill")
      .filter((el) => {
        return el.getAttribute("data-active") === "true";
      })
      .map((el) => {
        return el.getAttribute("data-pane") as EqPaneId;
      });
  }

  /** Clicks the pane pill for the given id — drives the real eqWorkspace
   * machine's togglePane intent. */
  async togglePane(id: EqPaneId): Promise<void> {
    await this.user.click(this.pillFor("chart-pane-pill", "data-pane", id));
  }

  /** Whether the LOG price-axis pill is currently active. */
  yScaleActive(): boolean {
    return (
      within(this.root)
        .queryAllByTestId("chart-yscale-pill")[0]
        ?.getAttribute("data-active") === "true"
    );
  }

  /** Clicks the LOG pill — drives the real eqWorkspace machine's
   * toggleYScale intent. */
  async toggleYScale(): Promise<void> {
    const pill = within(this.root).queryAllByTestId("chart-yscale-pill")[0];

    if (!pill) {
      throw new Error("chart-yscale-pill not rendered");
    }

    await this.user.click(pill);
  }

  /** The currently-active draw-tool pill's `data-tool` ("trendline" |
   * "hline"), or null when the cursor tool is active — no draw pill carries
   * `data-active="true"` in that state (mirrors {@link activeChartType}). */
  activeDrawTool(): Exclude<EqDrawTool, "cursor"> | null {
    const active = within(this.root)
      .queryAllByTestId("chart-draw-pill")
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return (
      (active?.getAttribute("data-tool") as Exclude<
        EqDrawTool,
        "cursor"
      > | null) ?? null
    );
  }

  /** Clicks the draw-tool pill for the given tool — drives the real
   * eqDrawings machine's setTool intent. Clicking an already-active pill
   * toggles it back to "cursor" (DrawToolPills' own momentary-mode
   * behaviour), so calling this twice in a row with the same tool both
   * activates and then reverts it. */
  async setDrawTool(tool: Exclude<EqDrawTool, "cursor">): Promise<void> {
    await this.user.click(this.pillFor("chart-draw-pill", "data-tool", tool));
  }

  /** Waits until no draw-tool pill is active — the cross-root twin of
   * {@link activeDrawTool}, needed when the REVERTING gesture (a committed
   * drawing auto-reverts the eqDrawings machine's tool to cursor) happened
   * on a separate mounted root sharing the same World (e.g. a pointer
   * gesture on ChartPanel's plot — see ChartDrawings.contract.spec.ts's
   * pill-workspace mount, mirroring ChartPanelPage.waitUntilPaneVisible's
   * identical cross-root rationale). */
  async waitUntilDrawToolReverted(): Promise<void> {
    await waitFor(() => {
      if (this.activeDrawTool() !== null) {
        throw new Error(`draw tool still active: ${this.activeDrawTool()}`);
      }
    });
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
