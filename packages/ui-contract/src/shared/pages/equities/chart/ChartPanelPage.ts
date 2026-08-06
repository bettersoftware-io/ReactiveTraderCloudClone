import { fireEvent, waitFor, within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type { EqPaneId } from "@rtc/client-core";

import { STUB_RECT } from "./CandleChartPage";

const PLOT_TESTID = "chart-plot";

/**
 * Page object for ChartPanel: the body composing InstrumentHeader +
 * CandleChart from the shared eqWorkspace machine's selection.
 */
export class ChartPanelPage extends MountedComponent<Record<string, never>> {
  isEmpty(): boolean {
    return within(this.root).queryByText(/select an instrument/i) !== null;
  }

  lastPrice(): string | null {
    return (
      within(this.root).queryByTestId("instrument-header-last")?.textContent ??
      null
    );
  }

  bid(): string | null {
    return (
      within(this.root).queryByTestId("instrument-header-bid")?.textContent ??
      null
    );
  }

  candleCount(): number {
    return this.root.querySelectorAll("[data-candle]").length;
  }

  /** Whether the given RSI/MACD pane is currently rendered — the
   * chart-column half of the pill↔pane contract: EqChartHeadPage's
   * togglePane/activePanes drive the pill in a shared World (the pills
   * live in EqChartHead, not here), and this observes the real chart
   * body's response. */
  paneVisible(kind: EqPaneId): boolean {
    return (
      this.root.querySelector(`[data-testid="chart-pane-${kind}"]`) !== null
    );
  }

  /** Every rendered pane's kind, in DOM order — see
   * CandleChartPage.paneOrder for the "document order, not selector-list
   * order" rationale. */
  paneOrder(): EqPaneId[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>(
        '[data-testid="chart-pane-rsi"], [data-testid="chart-pane-macd"]',
      ),
    ).map((el) => {
      return el
        .getAttribute("data-testid")
        ?.replace("chart-pane-", "") as EqPaneId;
    });
  }

  /** The chart wrap's `data-panes` count, found as a descendant since the
   * panel body (`this.root`) wraps InstrumentHeader + the chart column
   * above the wrap div itself (unlike CandleChartPage, whose root IS the
   * wrap when mounted directly). */
  panesAttr(): number {
    return Number(
      this.root.querySelector("[data-panes]")?.getAttribute("data-panes") ??
        "0",
    );
  }

  /** Waits until the given pane appears — EqChartHead and ChartPanel are
   * mounted as two SEPARATE React roots sharing one World (mountWith), so a
   * pill click's flush (scoped to the EqChartHead root) isn't guaranteed to
   * have already propagated to ChartPanel's own render by the time control
   * returns; poll rather than assert immediately (mirrors
   * ConnectionOverlayPage.waitUntilVisible, the established cross-root
   * pattern for a shared-World coupling spec). */
  async waitUntilPaneVisible(kind: EqPaneId): Promise<void> {
    await waitFor(() => {
      if (!this.paneVisible(kind)) {
        throw new Error(`pane ${kind} did not become visible`);
      }
    });
  }

  /** The pane-hidden twin of {@link waitUntilPaneVisible}. */
  async waitUntilPaneHidden(kind: EqPaneId): Promise<void> {
    await waitFor(() => {
      if (this.paneVisible(kind)) {
        throw new Error(`pane ${kind} is still visible`);
      }
    });
  }

  /** Waits until `data-panes` reads the given count. */
  async waitUntilPanesAttr(count: number): Promise<void> {
    await waitFor(() => {
      if (this.panesAttr() !== count) {
        throw new Error(`data-panes is ${this.panesAttr()}, expected ${count}`);
      }
    });
  }

  /** The chart wrap's `data-yscale` attribute ("linear" | "log"), found as a
   * descendant — same rationale as {@link panesAttr}: the panel body
   * (`this.root`) wraps InstrumentHeader + the chart column above the wrap
   * div itself. */
  yScaleAttr(): string {
    return (
      this.root.querySelector("[data-yscale]")?.getAttribute("data-yscale") ??
      ""
    );
  }

  /** Waits until `data-yscale` reads the given mode — the LOG-pill twin of
   * {@link waitUntilPanesAttr}. */
  async waitUntilYScaleAttr(mode: "linear" | "log"): Promise<void> {
    await waitFor(() => {
      if (this.yScaleAttr() !== mode) {
        throw new Error(
          `data-yscale is "${this.yScaleAttr()}", expected "${mode}"`,
        );
      }
    });
  }

  /** Whether any chart-drawing (trendline/hline) is currently rendered in
   * the chart column — the drawings-machine counterpart of {@link
   * paneVisible}, used by the drawings contract's symbol-isolation case
   * (ChartDrawings.contract.spec.ts): a drawing is per-symbol, so switching
   * the shared eqWorkspace selection away from the drawn symbol should make
   * this go false, and true again on switching back. */
  drawingVisible(): boolean {
    return this.root.querySelector('[data-testid="chart-drawing"]') !== null;
  }

  /** Every rendered chart-drawing's `data-kind` ("trendline" | "hline"), in
   * DOM order — the drawings-machine counterpart of {@link paneOrder}. */
  drawingKinds(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-drawing"]'),
    ).map((el) => {
      return el.getAttribute("data-kind") ?? "";
    });
  }

  /** The i-th rendered drawing's given attribute (e.g. "x1", "y1") — mirrors
   * CandleChartPage.drawingAttr, needed by the prepend/live-append
   * anchor-shift regression case (ChartDrawings.contract.spec.ts): that case
   * draws through ChartPanel's own plot (not a standalone CandleChart mount)
   * so the drawing's `sym` key comes from the real eqWorkspace selection. */
  drawingAttr(i: number, name: string): string | null {
    return (
      Array.from(this.root.querySelectorAll('[data-testid="chart-drawing"]'))[
        i
      ]?.getAttribute(name) ?? null
    );
  }

  /** Dispatches a pointerdown on the panel's OWN rendered chart plot — the
   * drawings contract's symbol-isolation and pill-drawing cases need to
   * draw through ChartPanel's real CandleChart (not a standalone mount), so
   * the committed drawing's `sym` key comes from the shared eqWorkspace
   * selection, not a spec-supplied literal. Mirrors
   * CandleChartPage.pointerDown's coordinate math against the same stubbed
   * rect (imported, not re-declared) — an hline commits immediately on
   * pointerdown (useChartGestures.startDrag), so no matching pointerUp is
   * needed for that tool. */
  plotPointerDown(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerDown(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** Dispatches a pointermove on the panel's plot — the trendline draft's
   * second anchor, continuing whatever {@link plotPointerDown} opened
   * (mirrors CandleChartPage.setPointer's coordinate math). */
  plotPointerMove(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerMove(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** Dispatches a pointerup on the panel's plot — commits or discards
   * whatever gesture {@link plotPointerDown} (plus any intervening {@link
   * plotPointerMove}) opened. */
  plotPointerUp(xFrac: number, yFrac: number): void {
    const plot = this.plot();
    const rect = plot.getBoundingClientRect();
    fireEvent.pointerUp(plot, {
      pointerId: 1,
      clientX: rect.left + xFrac * rect.width,
      clientY: rect.top + yFrac * rect.height,
    });
    this.setProps({});
  }

  /** The plot element with jsdom's holes stubbed — see
   * CandleChartPage.plot's identical rationale (a concrete bounding rect
   * plus the pointer-capture trio jsdom doesn't implement). */
  private plot(): HTMLElement {
    const el = within(this.root).getByTestId(PLOT_TESTID);

    el.getBoundingClientRect = (): DOMRect => {
      return STUB_RECT;
    };

    el.setPointerCapture = (): void => {};

    el.hasPointerCapture = (): boolean => {
      return false;
    };

    el.releasePointerCapture = (): void => {};

    return el;
  }
}
