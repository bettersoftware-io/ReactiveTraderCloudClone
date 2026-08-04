import { expect, type Locator, type Page } from "@playwright/test";

import type {
  EquitiesChartPO,
  EquitiesPaneKind,
} from "../contracts/EquitiesChart";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightEquitiesChart implements EquitiesChartPO {
  constructor(private readonly page: Page) {}

  private plot(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.plot);
  }

  private backToLive(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.backToLive);
  }

  private navigator(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.navigator);
  }

  // The pill's data-testid is shared by both panes (IndicatorPills.tsx) —
  // narrowed to one via the sibling `data-pane` attribute, combined with
  // `.and` rather than a raw compound selector so the testid half still
  // routes through the TESTIDS constant (grep-gates #1/#4).
  private panePill(kind: EquitiesPaneKind): Locator {
    return this.page
      .getByTestId(TESTIDS.equities.chart.panePill)
      .and(this.page.locator(`[data-pane="${kind}"]`));
  }

  private pane(kind: EquitiesPaneKind): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.pane(kind));
  }

  private paneReadout(kind: EquitiesPaneKind): Locator {
    return this.pane(kind).getByTestId(TESTIDS.equities.chart.paneReadout);
  }

  private yScalePill(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.yScalePill);
  }

  // The chart wrap (ChartPlot.tsx) carries data-yscale but no testid of its
  // own — the same `.locator("[data-...]")` pattern `panePill` uses for its
  // sibling `data-pane` attribute.
  private chartWrap(): Locator {
    return this.page.locator("[data-yscale]");
  }

  async waitPlotVisible(timeoutMs: number): Promise<void> {
    await expect(this.plot()).toBeVisible({ timeout: timeoutMs });
  }

  async focusPlot(): Promise<void> {
    await this.plot().click();
  }

  async pressArrowLeft(): Promise<void> {
    await this.plot().press("ArrowLeft");
  }

  async pressHome(): Promise<void> {
    await this.plot().press("Home");
  }

  async waitBackToLiveVisible(timeoutMs: number): Promise<void> {
    await expect(this.backToLive()).toBeVisible({ timeout: timeoutMs });
  }

  async waitBackToLiveHidden(timeoutMs: number): Promise<void> {
    await expect(this.backToLive()).toBeHidden({ timeout: timeoutMs });
  }

  async clickBackToLive(): Promise<void> {
    await this.backToLive().click();
  }

  async timeLabels(): Promise<string[]> {
    return await this.page
      .getByTestId(TESTIDS.equities.chart.timeLabel)
      .allTextContents();
  }

  async oldestTimeLabel(): Promise<string> {
    const text = await this.page
      .getByTestId(TESTIDS.equities.chart.timeLabel)
      .first()
      .textContent();
    return text ?? "";
  }

  async waitNavigatorVisible(timeoutMs: number): Promise<void> {
    await expect(this.navigator()).toBeVisible({ timeout: timeoutMs });
  }

  async dragNavigatorWindowBy(stripWidthFrac: number): Promise<void> {
    const strip = await this.navigator().boundingBox();
    const windowBox = await this.page
      .getByTestId(TESTIDS.equities.chart.navigatorWindow)
      .boundingBox();

    if (!strip || !windowBox) {
      throw new Error("navigator strip/window not laid out");
    }

    const fromX = windowBox.x + windowBox.width / 2;
    const y = strip.y + strip.height / 2;
    await this.page.mouse.move(fromX, y);
    await this.page.mouse.down();
    await this.page.mouse.move(fromX + stripWidthFrac * strip.width, y, {
      steps: 5,
    });
    await this.page.mouse.up();
  }

  async dragNavigatorRightHandleToLiveEdge(): Promise<void> {
    const strip = await this.navigator().boundingBox();
    const handle = await this.page
      .getByTestId(TESTIDS.equities.chart.navigatorHandleRight)
      .boundingBox();

    if (!strip || !handle) {
      throw new Error("navigator strip/handle not laid out");
    }

    const y = strip.y + strip.height / 2;
    await this.page.mouse.move(handle.x + handle.width / 2, y);
    await this.page.mouse.down();
    // Resizing the "end" edge to this -1px point always lands the new end at
    // seriesLen - seriesLen/stripWidthPx, regardless of the starting window
    // (the starting position cancels out of the resize delta). So the -1px
    // endpoint only registers as the live edge (isAtLiveEdge, EDGE_EPS = 0.5
    // of seriesLen 300) once the strip is >=600px wide. At the current
    // 1280px viewport / 290px right-rail layout the strip renders ~933px —
    // ~1.55x margin — but that margin is a function of unrelated layout
    // constants, not asserted here: a future layout change that shrinks the
    // chart column below 600px would break this drag with a confusing
    // failure signature.
    await this.page.mouse.move(strip.x + strip.width - 1, y, { steps: 5 });
    await this.page.mouse.up();
  }

  async clickPanePill(kind: EquitiesPaneKind): Promise<void> {
    await this.panePill(kind).click();
  }

  async waitPaneVisible(
    kind: EquitiesPaneKind,
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.pane(kind)).toBeVisible({ timeout: timeoutMs });
  }

  async hoverPlotCenter(): Promise<void> {
    // Locator.hover moves the mouse via real OS-level input (not a
    // dispatched synthetic event), so it fires the genuine pointermove jsdom
    // can't produce — the one lifecycle useChartGestures' trackPaneCursor
    // needs to see to populate the shared crosshair cursor.
    await this.plot().hover();
  }

  async waitPaneReadoutVisible(
    kind: EquitiesPaneKind,
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.paneReadout(kind)).toBeVisible({ timeout: timeoutMs });
  }

  async paneReadoutText(kind: EquitiesPaneKind): Promise<string> {
    const text = await this.paneReadout(kind).textContent();
    return text ?? "";
  }

  async clickYScalePill(): Promise<void> {
    await this.yScalePill().click();
  }

  async waitYScale(mode: "linear" | "log", timeoutMs: number): Promise<void> {
    await expect(this.chartWrap()).toHaveAttribute("data-yscale", mode, {
      timeout: timeoutMs,
    });
  }

  async priceLabelTexts(): Promise<string[]> {
    return await this.page
      .getByTestId(TESTIDS.equities.chart.priceLabel)
      .allTextContents();
  }
}
