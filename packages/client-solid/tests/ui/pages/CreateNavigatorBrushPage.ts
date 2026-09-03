import { renderHook } from "@solidjs/testing-library";
import type { Accessor } from "solid-js";

import type { ChartViewport } from "@rtc/motion-core";

import {
  createNavigatorBrush,
  type NavigatorBrush,
} from "#/ui/equities/chart/createNavigatorBrush";

export interface UseNavigatorBrushPage {
  mount(
    viewport: Accessor<ChartViewport>,
    applyViewport: (next: ChartViewport) => void,
    seriesLen: Accessor<number>,
    firstCandleTime?: Accessor<number | undefined>,
  ): NavigatorBrush;
}

/** The framework surface for `createNavigatorBrush.test.ts`. */
export function navigatorBrushPage(): UseNavigatorBrushPage {
  return {
    mount(
      viewport: Accessor<ChartViewport>,
      applyViewport: (next: ChartViewport) => void,
      seriesLen: Accessor<number>,
      firstCandleTime?: Accessor<number | undefined>,
    ): NavigatorBrush {
      const { result } = renderHook(() => {
        return createNavigatorBrush(
          viewport,
          applyViewport,
          seriesLen,
          firstCandleTime,
        );
      });

      return result;
    },
  };
}
