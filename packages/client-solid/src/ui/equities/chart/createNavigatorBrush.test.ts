import { batch, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { type ChartViewport, panBy, shiftForPrepend } from "@rtc/motion-core";

import { navigatorBrushPage } from "#tests/ui/pages/CreateNavigatorBrushPage";

const SERIES_LEN = 300;
const VIEWPORT: ChartViewport = { start: 240, end: 300 };
const STRIP_RECT = { left: 0, top: 0, width: 500, height: 32 } as DOMRect;

const page = navigatorBrushPage();

describe("createNavigatorBrush", () => {
  it("dragging the window body pans the viewport WITH the pointer", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerDown(brushEvent("window", 450));
    // dx −50px of 500 → −0.1 × 300 = −30 candles, window follows the pointer left
    result.stripProps.onPointerMove(moveEvent(400));

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 270 });
  });

  it("dragging the right handle resizes only the end edge", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerDown(brushEvent("handle-right", 500));
    result.stripProps.onPointerMove(moveEvent(450));

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 240, end: 270 });
  });

  it("dragging the left handle resizes only the start edge", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerDown(brushEvent("handle-left", 400));
    result.stripProps.onPointerMove(moveEvent(350));

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 300 });
  });

  it("a track pointerdown recentres the window immediately, then keeps dragging it", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    // 250 / 500 → idx 150 → centred {120, 180}
    result.stripProps.onPointerDown(brushEvent("track", 250));
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 120, end: 180 });

    // +50px → +30 candles from the RECENTRED origin
    result.stripProps.onPointerMove(moveEvent(300));
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 150, end: 210 });
  });

  it("moves recompute from the fixed drag origin, not cumulatively", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerDown(brushEvent("window", 450));
    result.stripProps.onPointerMove(moveEvent(400));
    result.stripProps.onPointerMove(moveEvent(425));

    // −25px total from origin → −15 candles, NOT −30 −15.
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 225, end: 285 });
  });

  it("pointer moves without a prior pointerdown are ignored", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerMove(moveEvent(400));

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("pointerup ends the drag; pointercancel does the same (no phantom drag)", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    result.stripProps.onPointerDown(brushEvent("window", 450));
    result.stripProps.onPointerCancel(brushEvent("window", 450));
    applyViewport.mockClear();

    result.stripProps.onPointerMove(moveEvent(100));

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("captures the pointer on pointerdown", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);
    const setPointerCapture = vi.fn();
    const event = {
      pointerId: 1,
      clientX: 450,
      target: hitTargetEl("window"),
      currentTarget: {
        setPointerCapture,
        hasPointerCapture: (): boolean => {
          return true;
        },
        releasePointerCapture: vi.fn(),
        getBoundingClientRect: (): DOMRect => {
          return STRIP_RECT;
        },
      } as unknown as HTMLDivElement,
    } as unknown as PointerEvent;

    result.stripProps.onPointerDown(event);

    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("C1: a prepend landing MID-DRAG shifts the cached brush origin, so the next move lands where the same drag delta would in the shifted frame (no snap-back)", () => {
    const GREW_BY = 300;
    const NEW_SERIES_LEN = SERIES_LEN + GREW_BY;
    const [seriesLen, setSeriesLen] = createSignal(SERIES_LEN);
    const [firstCandleTime, setFirstCandleTime] = createSignal<
      number | undefined
    >(1_000_000);
    const applyViewport = vi.fn();
    // eslint-disable-next-line solid/reactivity -- read inside the renderHook tracked scope page.mount establishes internally
    const result = page.mount(
      fixedViewport,
      applyViewport,
      seriesLen,
      firstCandleTime,
    );

    result.stripProps.onPointerDown(brushEvent("window", 450));

    // A 300-candle backfill prepend lands mid-drag: first time got OLDER,
    // length grew by 300. Batched so createComputed observes both signals'
    // new values in the same run, matching React's single simultaneous
    // rerender.
    batch(() => {
      setSeriesLen(NEW_SERIES_LEN);
      setFirstCandleTime(700_000);
    });

    result.stripProps.onPointerMove(moveEvent(400));

    // The shifted origin (VIEWPORT translated by +GREW_BY) fed through the
    // exact same panBy the factory itself uses, at the post-prepend
    // seriesLen — i.e. "what the same drag delta gives in the shifted
    // frame", not a hand-derived magic number. Without the C1 fix the
    // factory would instead pan from the STALE (unshifted) VIEWPORT,
    // landing 300 candles further back.
    const shiftedOrigin = shiftForPrepend(VIEWPORT, GREW_BY);
    const dCandles = ((400 - 450) / STRIP_RECT.width) * NEW_SERIES_LEN;
    const expected = panBy(shiftedOrigin, dCandles, NEW_SERIES_LEN);
    expect(applyViewport).toHaveBeenLastCalledWith(expected);
  });

  it("endBrush ignores a pointerup with no active drag, or one for a different pointerId than the active drag", () => {
    const applyViewport = vi.fn();
    const result = page.mount(fixedViewport, applyViewport, fixedSeriesLen);

    // No prior pointerdown at all: brushOrigin is null — the up must be a
    // complete no-op, not just "didn't crash".
    result.stripProps.onPointerUp(brushEvent("window", 450));
    expect(applyViewport).not.toHaveBeenCalled();

    result.stripProps.onPointerDown(brushEvent("window", 450));
    applyViewport.mockClear();

    // A pointerup for a DIFFERENT pointerId than the active drag must not
    // end it — the still-active drag (pointerId 1) keeps responding to moves.
    result.stripProps.onPointerUp({
      ...brushEvent("window", 450),
      pointerId: 2,
    });
    result.stripProps.onPointerMove(moveEvent(400));

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 270 });
  });
});

function fixedViewport(): ChartViewport {
  return VIEWPORT;
}

function fixedSeriesLen(): number {
  return SERIES_LEN;
}

/** What the pointerdown landed on: the window body, a handle, or the bare
 * track — expressed through the `closest()` answers the factory's hit-test
 * makes (`[data-nav-edge]` first, then the window body's `[data-nav-body]`). */
type HitTarget = "window" | "handle-left" | "handle-right" | "track";

/** The narrow shape of the hit-tested element the factory reads via
 * `e.target?.closest(...)`. */
interface HitTargetEl {
  closest: (sel: string) => unknown;
}

function hitTargetEl(hit: HitTarget): HitTargetEl {
  return {
    closest: (sel: string): unknown => {
      if (sel === "[data-nav-edge]") {
        if (hit === "handle-left") {
          return {
            getAttribute: (): string => {
              return "start";
            },
          };
        }

        if (hit === "handle-right") {
          return {
            getAttribute: (): string => {
              return "end";
            },
          };
        }

        return null;
      }

      if (sel === "[data-nav-body]") {
        return hit === "window" ? {} : null;
      }

      return null;
    },
  };
}

function brushEvent(hit: HitTarget, clientX: number): PointerEvent {
  return {
    pointerId: 1,
    clientX,
    target: hitTargetEl(hit),
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: (): boolean => {
        return true;
      },
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: (): DOMRect => {
        return STRIP_RECT;
      },
    } as unknown as HTMLDivElement,
  } as unknown as PointerEvent;
}

function moveEvent(clientX: number): PointerEvent {
  return brushEvent("track", clientX);
}
