import { expect, type Locator, type Page } from "@playwright/test";

import type { EquitiesChartPO } from "../contracts/EquitiesChart";
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

  async waitPlotVisible(timeoutMs: number): Promise<void> {
    await expect(this.plot()).toBeVisible({ timeout: timeoutMs });
  }

  async focusPlot(): Promise<void> {
    await this.plot().click();
  }

  async pressArrowLeft(): Promise<void> {
    await this.plot().press("ArrowLeft");
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
    // The -1px end point is 1px shy of the strip's right edge, so it only
    // registers as the live edge (isAtLiveEdge, EDGE_EPS = 0.5 candles) once
    // the strip is wider than roughly 240px at the current 1280px viewport /
    // 290px right-rail layout, not the ~600px an earlier version of this
    // comment claimed. That layout renders the strip at ~933px — comfortably
    // past the bound — but the margin is still a function of unrelated
    // layout constants, not asserted here: a future column-width shrink
    // could break this drag with a confusing failure signature.
    await this.page.mouse.move(strip.x + strip.width - 1, y, { steps: 5 });
    await this.page.mouse.up();
  }
}
