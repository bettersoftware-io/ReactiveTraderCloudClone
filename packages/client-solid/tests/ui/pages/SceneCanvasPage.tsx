import { cleanup, render } from "@solidjs/testing-library";
import { type Accessor, flush } from "solid-js";
import { vi } from "vitest";

import type { Canvas2D, CanvasSize, ChartPalette } from "@rtc/motion-core";

import { SceneCanvas } from "#/ui/equities/chart/SceneCanvas";

export interface SceneCanvasPage {
  /** Mounts a `SceneCanvas` over `scene` whose box has a real size (jsdom
   * lays nothing out), and returns the scenes its `draw` slot painted, in
   * order. */
  mount(scene: Accessor<string>): readonly string[];
  unmountAll(): void;
}

/** The framework surface for `SceneCanvas.test.tsx`. jsdom has neither a 2D
 * context nor a ResizeObserver that fires, so the page stands in for both:
 * a context stub (the paint never reads it) and an observer that reports a
 * 400×200 box the moment it observes. */
export function sceneCanvasPage(): SceneCanvasPage {
  const restorers: (() => void)[] = [];

  return {
    mount(scene: Accessor<string>): readonly string[] {
      const painted: string[] = [];
      const getContext = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue({
          setTransform: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
      const realObserver = globalThis.ResizeObserver;

      globalThis.ResizeObserver = SizedResizeObserver;
      restorers.push(() => {
        getContext.mockRestore();
        globalThis.ResizeObserver = realObserver;
      });

      function recordPaint(
        _ctx: Canvas2D,
        painting: string,
        _palette: ChartPalette,
        _size: CanvasSize,
      ): void {
        painted.push(painting);
      }

      render(() => {
        return (
          <SceneCanvas scene={scene()} draw={recordPaint} testid="scene" />
        );
      });
      flush();

      return painted;
    },
    unmountAll(): void {
      cleanup();

      for (const restore of restorers.splice(0)) {
        restore();
      }
    },
  };
}

/** Reports a 400×200 content box for every element it observes, at once. */
class SizedResizeObserver {
  private readonly report: ResizeObserverCallback;

  constructor(report: ResizeObserverCallback) {
    this.report = report;
  }

  observe(): void {
    this.report(
      [
        { contentRect: { width: 400, height: 200 } },
      ] as unknown as ResizeObserverEntry[],
      this as unknown as ResizeObserver,
    );
  }

  unobserve(): void {}

  disconnect(): void {}
}
