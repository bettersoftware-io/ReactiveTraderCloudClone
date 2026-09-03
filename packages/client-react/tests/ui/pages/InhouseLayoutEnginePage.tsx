import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { vi } from "vitest";

import type { LayoutState } from "@rtc/client-core";

import type { InhouseLayoutEngineProps } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

type InhouseLayoutEngineCallbacks = Partial<
  Pick<
    InhouseLayoutEngineProps,
    "onMaximize" | "onRestore" | "onCollapse" | "onExpand" | "onResize"
  >
>;

interface PointerInit {
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface BoundingRectStub {
  restore(): void;
}

export interface InhouseLayoutEnginePage {
  mount(
    state: LayoutState,
    registry: PanelRegistry,
    callbacks?: InhouseLayoutEngineCallbacks,
  ): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  attribute(testId: string, name: string): string | null;
  click(testId: string): void;
  pointerDown(testId: string, init: PointerInit): void;
  pointerMove(
    testId: string,
    init: Pick<PointerInit, "clientX" | "clientY">,
  ): void;
  pointerUp(testId: string, init: PointerInit): void;
  /** `screen.getByTestId(testId).closest(selector)`'s `name` attribute, or
   * null if either the element or the ancestor is missing. */
  closestAttribute(
    testId: string,
    selector: string,
    name: string,
  ): string | null;
  /** The text of the `panel-error` fallback nested inside the given panel's
   * scoped subtree (via `within`), proving the error boundary is SCOPED to
   * that panel rather than a full-page fallback. */
  errorTextWithin(panelTestId: string): string;
  /** Stubs every element's `getBoundingClientRect` width by looking up its
   * `data-testid` in `widthByTestId` (falling back to `fallbackWidth` for
   * unlisted ids, e.g. the split container itself) — the split-resize
   * measurement tests' baseline, since jsdom's real rects are zero-size. */
  stubBoundingRectByTestId(
    widthByTestId: Record<string, number>,
    fallbackWidth: number,
  ): BoundingRectStub;
}

function noop(): void {}

/** The framework surface for `InhouseLayoutEngine.smoke.test.tsx`. */
export function inhouseLayoutEnginePage(): InhouseLayoutEnginePage {
  function node(testId: string): HTMLElement {
    return screen.getByTestId(testId);
  }

  return {
    mount(
      state: LayoutState,
      registry: PanelRegistry,
      callbacks: InhouseLayoutEngineCallbacks = {},
    ): void {
      render(
        <InhouseLayoutEngine
          state={state}
          registry={registry}
          onMaximize={callbacks.onMaximize ?? noop}
          onRestore={callbacks.onRestore ?? noop}
          onCollapse={callbacks.onCollapse ?? noop}
          onExpand={callbacks.onExpand ?? noop}
          onResize={callbacks.onResize ?? noop}
        />,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return node(testId).textContent ?? "";
    },
    attribute(testId: string, name: string): string | null {
      return node(testId).getAttribute(name);
    },
    click(testId: string): void {
      node(testId).click();
    },
    pointerDown(testId: string, init: PointerInit): void {
      fireEvent.pointerDown(node(testId), init);
    },
    pointerMove(
      testId: string,
      init: Pick<PointerInit, "clientX" | "clientY">,
    ): void {
      fireEvent.pointerMove(node(testId), init);
    },
    pointerUp(testId: string, init: PointerInit): void {
      fireEvent.pointerUp(node(testId), init);
    },
    closestAttribute(
      testId: string,
      selector: string,
      name: string,
    ): string | null {
      return node(testId).closest(selector)?.getAttribute(name) ?? null;
    },
    errorTextWithin(panelTestId: string): string {
      return (
        within(node(panelTestId)).getByTestId("panel-error").textContent ?? ""
      );
    },
    stubBoundingRectByTestId(
      widthByTestId: Record<string, number>,
      fallbackWidth: number,
    ): BoundingRectStub {
      const spy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function stubbedRect(this: Element): DOMRect {
          const width =
            widthByTestId[this.getAttribute("data-testid") ?? ""] ??
            fallbackWidth;

          return new DOMRect(0, 0, width, 600);
        });

      return {
        restore(): void {
          spy.mockRestore();
        },
      };
    },
  };
}
