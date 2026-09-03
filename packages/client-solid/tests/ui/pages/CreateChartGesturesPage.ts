import { render, renderHook } from "@solidjs/testing-library";
import type { Accessor } from "solid-js";

import {
  type ChartGestures,
  createChartGestures,
  type DrawGestureSlots,
} from "#/ui/equities/chart/createChartGestures";

interface ChartGesturesHarnessHandle {
  readonly state: ChartGestures;
  /** Dispatches a native `wheel` event on the plot div (`createChartGestures`'
   * own non-passive `addEventListener`, unreachable through a passive Solid
   * `on:wheel` binding) and reports whether it called `preventDefault()`. */
  dispatchWheel(deltaY: number, clientX: number): boolean;
}

export interface UseChartGesturesPage {
  mount(
    seriesLen: Accessor<number>,
    defaultVisible: Accessor<number>,
    firstCandleTime?: Accessor<number | undefined>,
    draw?: DrawGestureSlots,
  ): ChartGestures;
  /** Mounts the plot div for real (ref + gesture props attached), for the
   * wheel-effect tests that need a populated `plotRef` before `onMount`'s
   * native listener registers. */
  mountHarness(
    seriesLen: Accessor<number>,
    defaultVisible: Accessor<number>,
  ): ChartGesturesHarnessHandle;
}

/** Stubs a 500×50 rect at the origin for the plot div, standing in for the
 * real layout jsdom never computes (getBoundingClientRect() is all-zeros by
 * default there). */
function stubPlotRect(el: HTMLElement): void {
  el.getBoundingClientRect = (): DOMRect => {
    return { left: 0, top: 0, width: 500, height: 50 } as DOMRect;
  };
}

/** Minimal harness: builds the plot div for real (ref + gesture props) so
 * the wheel-effect tests (which need a real DOM node under plotRef) can
 * drive and assert against it without a full CandleChart mount. A plain
 * function returning a DOM node — no JSX needed — is a valid Solid
 * "component" for `render()`. */
function chartGesturesHarness(
  seriesLen: Accessor<number>,
  defaultVisible: Accessor<number>,
  onReady: (g: ChartGestures) => void,
): HTMLElement {
  const g = createChartGestures(seriesLen, defaultVisible);
  onReady(g);

  const el = document.createElement("div");
  el.setAttribute("data-testid", "plot");
  el.tabIndex = 0;
  g.plotRef(el);

  return el;
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

/** The framework surface for `createChartGestures.test.ts`. */
export function chartGesturesPage(): UseChartGesturesPage {
  return {
    mount(
      seriesLen: Accessor<number>,
      defaultVisible: Accessor<number>,
      firstCandleTime?: Accessor<number | undefined>,
      draw?: DrawGestureSlots,
    ): ChartGestures {
      const { result } = renderHook(() => {
        return createChartGestures(
          seriesLen,
          defaultVisible,
          firstCandleTime,
          draw,
        );
      });

      return result;
    },
    mountHarness(
      seriesLen: Accessor<number>,
      defaultVisible: Accessor<number>,
    ): ChartGesturesHarnessHandle {
      let gestures: ChartGestures | null = null;
      const { getByTestId } = render(() => {
        return chartGesturesHarness(seriesLen, defaultVisible, (g) => {
          gestures = g;
        });
      });
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

          el.dispatchEvent(event);

          return event.defaultPrevented;
        },
      };
    },
  };
}
