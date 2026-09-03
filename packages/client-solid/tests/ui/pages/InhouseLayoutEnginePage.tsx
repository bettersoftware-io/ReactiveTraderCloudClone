import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@solidjs/testing-library";
import type { Accessor } from "solid-js";
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

interface CellFlags {
  /** The nearest cell ancestor's `data-initial-cell` flag — a pixel-pinned
   * rail width that stays draggable. */
  isInitial: boolean;
  /** The nearest cell ancestor's `data-fixed-cell` flag — a pixel-pinned
   * width with NO resize handle. */
  isFixed: boolean;
}

/** A cell's `--split-size` fact plus an opaque identity token — the "live
 * state update" regression asserts the SAME cell element survives a
 * state-driven re-render (no remount), which is an identity fact, not a
 * value one; `cellUnchanged` compares two snapshots without ever handing the
 * spec a raw `Element`. */
interface CellSnapshot {
  readonly splitSize: string;
}

interface InternalCellSnapshot extends CellSnapshot {
  readonly el: Element | null;
}

function noop(): void {}

export interface InhouseLayoutEnginePage {
  mount(
    state: LayoutState,
    registry: PanelRegistry,
    callbacks?: InhouseLayoutEngineCallbacks,
  ): void;
  /** Mounts with `state` fed from a live Solid signal — the Solid-port-only
   * "components must not freeze at initial render" regressions (no React
   * analogue: React re-invokes the whole component function on every prop
   * change, so a plain value naturally recomputes; Solid component bodies
   * run once). */
  mountLive(
    state: Accessor<LayoutState>,
    registry: PanelRegistry,
    callbacks?: InhouseLayoutEngineCallbacks,
  ): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  click(testId: string): void;
  pointerDown(testId: string, init: PointerInit): void;
  pointerMove(
    testId: string,
    init: Pick<PointerInit, "clientX" | "clientY">,
  ): void;
  pointerUp(testId: string, init: PointerInit): void;
  /** Whether the panel/cell at `testId` renders as a collapsed strip
   * (`data-strip`). */
  stripFlag(testId: string): boolean;
  /** The strip's reclaim axis (`data-strip-orientation`) — the strip is
   * always in one state or the other once rendered, never absent. */
  stripOrientation(testId: string): "vertical" | "horizontal";
  /** Whether the cell at `testId` fills the space a fully-stripped sibling
   * column/row freed (`data-strip-fill`). */
  stripFill(testId: string): boolean;
  /** Whether the cell at `testId` is itself a design-value pixel-pinned rail
   * (`data-initial-cell`). */
  initialCellFlag(testId: string): boolean;
  /** Whether the cell at `testId` is a stripped panel's own cell
   * (`data-strip-cell`). */
  stripCellFlag(testId: string): boolean;
  /** Whether the panel at `testId` is the live-maximized one
   * (`data-maximized`). */
  maximizedFlag(testId: string): boolean;
  /** The `isInitial`/`isFixed` flags of the nearest cell ancestor of the
   * PANEL at `panelTestId` (panels don't carry these flags themselves —
   * only their wrapping cell does). */
  initialCellOf(panelTestId: string): CellFlags;
  /** The text of the `panel-error` fallback nested inside the given panel's
   * scoped subtree (via `within`), proving the error boundary is SCOPED to
   * that panel rather than a full-page fallback. */
  errorTextWithin(panelTestId: string): string;
  /** A `--split-size` + identity snapshot of the cell wrapping the panel at
   * `panelTestId` — compare two snapshots with `cellUnchanged`. */
  cellSnapshotOfPanel(panelTestId: string): CellSnapshot;
  /** True when both snapshots' underlying cell element is the SAME DOM node
   * (no remount happened between them). */
  cellUnchanged(before: CellSnapshot, after: CellSnapshot): boolean;
  /** Stubs every element's `getBoundingClientRect` width by looking up its
   * `data-testid` in `widthByTestId` (falling back to `fallbackWidth` for
   * unlisted ids, e.g. the split container itself) — the split-resize
   * measurement tests' baseline, since jsdom's real rects are zero-size. */
  stubBoundingRectByTestId(
    widthByTestId: Record<string, number>,
    fallbackWidth: number,
  ): BoundingRectStub;
}

/** The framework surface for `InhouseLayoutEngine.smoke.test.tsx`. No raw
 * CSS selector or DOM attribute name crosses back into the spec: every
 * `data-*` name this component renders is behind one of the named flag
 * methods below. */
export function inhouseLayoutEnginePage(): InhouseLayoutEnginePage {
  function node(testId: string): HTMLElement {
    return screen.getByTestId(testId);
  }

  function attribute(testId: string, name: string): string | null {
    return node(testId).getAttribute(name);
  }

  function flag(testId: string, name: string): boolean {
    return attribute(testId, name) === "true";
  }

  function cellOf(panelTestId: string): Element | null {
    return node(panelTestId).closest("[data-fixed-cell]");
  }

  return {
    mount(
      state: LayoutState,
      registry: PanelRegistry,
      callbacks: InhouseLayoutEngineCallbacks = {},
    ): void {
      render(() => {
        return (
          <InhouseLayoutEngine
            state={state}
            registry={registry}
            onMaximize={callbacks.onMaximize ?? noop}
            onRestore={callbacks.onRestore ?? noop}
            onCollapse={callbacks.onCollapse ?? noop}
            onExpand={callbacks.onExpand ?? noop}
            onResize={callbacks.onResize ?? noop}
          />
        );
      });
    },
    mountLive(
      state: Accessor<LayoutState>,
      registry: PanelRegistry,
      callbacks: InhouseLayoutEngineCallbacks = {},
    ): void {
      render(() => {
        return (
          <InhouseLayoutEngine
            state={state()}
            registry={registry}
            onMaximize={callbacks.onMaximize ?? noop}
            onRestore={callbacks.onRestore ?? noop}
            onCollapse={callbacks.onCollapse ?? noop}
            onExpand={callbacks.onExpand ?? noop}
            onResize={callbacks.onResize ?? noop}
          />
        );
      });
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
    stripFlag(testId: string): boolean {
      return flag(testId, "data-strip");
    },
    stripOrientation(testId: string): "vertical" | "horizontal" {
      return attribute(testId, "data-strip-orientation") === "vertical"
        ? "vertical"
        : "horizontal";
    },
    stripFill(testId: string): boolean {
      return flag(testId, "data-strip-fill");
    },
    initialCellFlag(testId: string): boolean {
      return flag(testId, "data-initial-cell");
    },
    stripCellFlag(testId: string): boolean {
      return flag(testId, "data-strip-cell");
    },
    maximizedFlag(testId: string): boolean {
      return flag(testId, "data-maximized");
    },
    initialCellOf(panelTestId: string): CellFlags {
      const cell = cellOf(panelTestId);

      return {
        isInitial: cell?.getAttribute("data-initial-cell") === "true",
        isFixed: cell?.getAttribute("data-fixed-cell") === "true",
      };
    },
    errorTextWithin(panelTestId: string): string {
      return (
        within(node(panelTestId)).getByTestId("panel-error").textContent ?? ""
      );
    },
    cellSnapshotOfPanel(panelTestId: string): CellSnapshot {
      const el = node(panelTestId).closest("[data-testid^='cell-']");
      const snapshot: InternalCellSnapshot = {
        splitSize:
          (el as HTMLElement | null)?.style.getPropertyValue("--split-size") ??
          "",
        el,
      };

      return snapshot;
    },
    cellUnchanged(before: CellSnapshot, after: CellSnapshot): boolean {
      return (
        (before as InternalCellSnapshot).el ===
        (after as InternalCellSnapshot).el
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
