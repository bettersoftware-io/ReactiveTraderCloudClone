import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, type ReactElement } from "react";

import type {
  ChartGestures,
  DrawGestureSlots,
} from "#/ui/equities/chart/useChartGestures";
import { useChartGestures } from "#/ui/equities/chart/useChartGestures";

interface HookProps {
  seriesLen: number;
  firstCandleTime?: number;
}

interface ChartGesturesHandle {
  readonly state: ChartGestures;
  rerender(seriesLen: number, firstCandleTime?: number): void;
  /** Flushes a plotProps/applyViewport/resetToLive call so the following
   * assertion sees the resulting render synchronously. */
  commit(effects: () => void): void;
}

interface ChartGesturesHarnessHandle {
  readonly state: ChartGestures;
  /** Dispatches a native `wheel` event on the plot div (the hook's own
   * non-passive `addEventListener`, unreachable through a synthetic
   * `onWheel` prop) and reports whether it called `preventDefault()`. */
  dispatchWheel(deltaY: number, clientX: number): boolean;
}

export interface UseChartGesturesPage {
  mount(
    seriesLen: number,
    defaultVisible: number,
    firstCandleTime?: number,
    draw?: DrawGestureSlots,
  ): ChartGesturesHandle;
  /** Mounts the plot div for real (ref + gesture props attached), for the
   * two wheel-effect tests that need a populated `plotRef` before the
   * native listener effect runs. */
  mountHarness(
    seriesLen: number,
    defaultVisible: number,
  ): ChartGesturesHarnessHandle;
  unmountAll(): void;
}

/** Stubs a 500×50 rect at the origin for the plot div, standing in for the
 * real layout jsdom never computes (getBoundingClientRect() is all-zeros by
 * default there). */
function stubPlotRect(el: HTMLElement): void {
  el.getBoundingClientRect = (): DOMRect => {
    return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
  };
}

interface WheelEventInit {
  deltaY: number;
  clientX: number;
}

type FakeWheelEvent = Event & WheelEventInit;

function wheelEvent(init: WheelEventInit): FakeWheelEvent {
  return Object.assign(new Event("wheel", { cancelable: true }), {
    deltaY: init.deltaY,
    clientX: init.clientX,
  });
}

interface ChartGesturesHarnessProps {
  seriesLen: number;
  defaultVisible: number;
  onReady: (g: ChartGestures) => void;
}

/** The framework surface for `useChartGestures.test.ts`. */
export function chartGesturesPage(): UseChartGesturesPage {
  // Minimal harness: renders the plot div for real (ref + gesture props) and
  // reports the live ChartGestures snapshot back out on every render, so the
  // wheel-effect tests (which need a real DOM node under plotRef) can drive
  // and assert against it without a full CandleChart mount. Declared inside
  // this factory rather than at module top level — mirrors
  // JarvisDrivenPulsePage's inline-`Harness` idiom used to dodge biome's
  // useComponentExportOnlyModules/noExportsInTest pair.
  function ChartGesturesHarness({
    seriesLen,
    defaultVisible,
    onReady,
  }: ChartGesturesHarnessProps): ReactElement {
    const g = useChartGestures(seriesLen, defaultVisible);
    onReady(g);
    return createElement("div", {
      "data-testid": "plot",
      ref: g.plotRef,
      tabIndex: 0,
      ...g.plotProps,
    });
  }

  return {
    mount(
      seriesLen: number,
      defaultVisible: number,
      firstCandleTime?: number,
      draw?: DrawGestureSlots,
    ): ChartGesturesHandle {
      const { result, rerender } = renderHook(
        (props: HookProps) => {
          return useChartGestures(
            props.seriesLen,
            defaultVisible,
            props.firstCandleTime,
            draw,
          );
        },
        { initialProps: { seriesLen, firstCandleTime } },
      );

      return {
        get state(): ChartGestures {
          return result.current;
        },
        rerender(nextSeriesLen: number, nextFirstCandleTime?: number): void {
          rerender({
            seriesLen: nextSeriesLen,
            firstCandleTime: nextFirstCandleTime,
          });
        },
        commit(effects: () => void): void {
          act(effects);
        },
      };
    },
    mountHarness(
      seriesLen: number,
      defaultVisible: number,
    ): ChartGesturesHarnessHandle {
      let gestures: ChartGestures | null = null;
      const { getByTestId } = render(
        createElement(ChartGesturesHarness, {
          seriesLen,
          defaultVisible,
          onReady: (g: ChartGestures) => {
            gestures = g;
          },
        }),
      );
      const el = getByTestId("plot");

      stubPlotRect(el);

      return {
        get state(): ChartGestures {
          if (gestures === null) {
            throw new Error("ChartGestures harness not ready");
          }

          return gestures;
        },
        dispatchWheel(deltaY: number, clientX: number): boolean {
          const event = wheelEvent({ deltaY, clientX });

          act(() => {
            el.dispatchEvent(event);
          });

          return event.defaultPrevented;
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
  };
}
