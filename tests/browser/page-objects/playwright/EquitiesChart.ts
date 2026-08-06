import { expect, type Locator, type Page } from "@playwright/test";

import type {
  EquitiesChartPO,
  EquitiesDrawTool,
  EquitiesPaneKind,
  PlotFraction,
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

  // Shared testid disambiguated by `data-tool`, same `.and` composition as
  // `panePill` above.
  private drawPill(tool: EquitiesDrawTool): Locator {
    return this.page
      .getByTestId(TESTIDS.equities.chart.drawPill)
      .and(this.page.locator(`[data-tool="${tool}"]`));
  }

  private drawing(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.drawing);
  }

  private drawingHandles(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.drawingHandle);
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

  async clickDrawPill(tool: EquitiesDrawTool): Promise<void> {
    await this.drawPill(tool).click();
  }

  async dragOnPlot(from: PlotFraction, to: PlotFraction): Promise<void> {
    const box = await this.plot().boundingBox();

    if (!box) {
      throw new Error("plot not laid out");
    }

    const fromX = box.x + from.x * box.width;
    const fromY = box.y + from.y * box.height;
    const toX = box.x + to.x * box.width;
    const toY = box.y + to.y * box.height;

    // Real page.mouse events (not a Locator action) — the app's drag gesture
    // relies on genuine pointer capture retargeting (useChartGestures'
    // startDrag/endDrag), which jsdom's synthetic pointer events don't model.
    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    await this.page.mouse.move(toX, toY, { steps: 10 });
    await this.page.mouse.up();
  }

  async waitDrawingVisible(timeoutMs: number): Promise<void> {
    await expect(this.drawing()).toBeVisible({ timeout: timeoutMs });
  }

  async clickDrawing(): Promise<void> {
    // The drawing overlay SVG is `pointer-events: none` (DrawingsLayer.tsx),
    // so a Locator.click() on the drawing element itself would time out
    // waiting for it to become "the target of pointer events" — it never
    // is. Instead, read its geometry and drive a real mouse click at the
    // plot underneath, at the drawing's own midpoint (the same coordinates
    // the app's own hit-testing runs against).
    const box = await this.drawing().boundingBox();

    if (!box) {
      throw new Error("drawing not laid out");
    }

    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  async waitDrawingSelected(timeoutMs: number): Promise<void> {
    await expect(this.drawing()).toHaveAttribute("data-selected", "true", {
      timeout: timeoutMs,
    });
  }

  async readDrawingGeometry(): Promise<string> {
    const line = this.drawing();
    const [x1, y1, x2, y2] = await Promise.all([
      line.getAttribute("x1"),
      line.getAttribute("y1"),
      line.getAttribute("x2"),
      line.getAttribute("y2"),
    ]);
    return `${x1},${y1},${x2},${y2}`;
  }

  async dragSelectedDrawingEndpoint(): Promise<void> {
    // Handles are `pointer-events: none` (DrawingsLayer.tsx), same trap as
    // `clickDrawing` above — grip the handle by driving a real pointer
    // through the PLOT underneath, at the handle's own coordinates. The
    // handle's cx/cy are plot-percent (SVG viewBox "0 0 100 100",
    // preserveAspectRatio="none", so it stretches to exactly the plot box).
    const handle = this.drawingHandles().nth(1);
    const [cx, cy, plotBox] = await Promise.all([
      handle.getAttribute("cx"),
      handle.getAttribute("cy"),
      this.plot().boundingBox(),
    ]);

    if (cx === null || cy === null || !plotBox) {
      throw new Error("drawing handle or plot not laid out");
    }

    const fromX = plotBox.x + (Number(cx) / 100) * plotBox.width;
    const fromY = plotBox.y + (Number(cy) / 100) * plotBox.height;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    await this.page.mouse.move(fromX + 80, fromY - 60, { steps: 10 });
    await this.page.mouse.up();
  }

  async expectDrawingGeometryChangedWithin(
    before: string,
    timeoutMs: number,
  ): Promise<void> {
    await expect
      .poll(() => this.readDrawingGeometry(), { timeout: timeoutMs })
      .not.toBe(before);
  }

  async pressDelete(): Promise<void> {
    await this.plot().focus();
    await this.page.keyboard.press("Delete");
  }

  async waitDrawingGone(timeoutMs: number): Promise<void> {
    await expect(this.drawing()).toHaveCount(0, { timeout: timeoutMs });
  }
}
