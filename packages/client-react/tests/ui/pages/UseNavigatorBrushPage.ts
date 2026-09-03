import { act, cleanup, renderHook } from "@testing-library/react";

import type { ChartViewport } from "@rtc/motion-core";

import type { NavigatorBrush } from "#/ui/equities/chart/useNavigatorBrush";
import { useNavigatorBrush } from "#/ui/equities/chart/useNavigatorBrush";

interface HookProps {
  seriesLen: number;
  firstCandleTime?: number;
}

interface NavigatorBrushHandle {
  readonly state: NavigatorBrush;
  /** Re-renders the hook with a new seriesLen/firstCandleTime pair — the C1
   * prepend-shift regression's rerender shape. */
  rerender(seriesLen: number, firstCandleTime?: number): void;
  /** Flushes a state-mutating call (a stripProps handler) so the following
   * assertion sees the resulting render synchronously. */
  commit(effects: () => void): void;
}

export interface UseNavigatorBrushPage {
  mount(
    viewport: ChartViewport,
    applyViewport: (next: ChartViewport) => void,
    seriesLen: number,
    firstCandleTime?: number,
  ): NavigatorBrushHandle;
  unmountAll(): void;
}

/** The framework surface for `useNavigatorBrush.test.ts`. */
export function navigatorBrushPage(): UseNavigatorBrushPage {
  return {
    mount(
      viewport: ChartViewport,
      applyViewport: (next: ChartViewport) => void,
      seriesLen: number,
      firstCandleTime?: number,
    ): NavigatorBrushHandle {
      const { result, rerender } = renderHook(
        (props: HookProps) => {
          return useNavigatorBrush(
            viewport,
            applyViewport,
            props.seriesLen,
            props.firstCandleTime,
          );
        },
        { initialProps: { seriesLen, firstCandleTime } },
      );

      return {
        get state(): NavigatorBrush {
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
    unmountAll(): void {
      cleanup();
    },
  };
}
