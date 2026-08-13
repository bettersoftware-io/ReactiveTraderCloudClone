/**
 * Unit test for the Solid mirror of the draggable Preferences dialog's
 * pointer-seam primitive (Task 14 React / Task 15 Solid). The pure clamp
 * math (`clampDragOffset`) is covered in `@rtc/motion-core`; this file
 * exercises the primitive's own responsibilities — pointer bookkeeping, the
 * `data-nodrag` guard (both direct-target and ancestor), and the open/close
 * reset — against a fixed, deterministic dialog rect and viewport so every
 * clamped offset below is an exact computed value, not a loose bound.
 */
import { renderHook } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDraggableDialog } from "./useDraggableDialog";

const DIALOG_RECT = { width: 400, height: 300 } as DOMRect;
const VIEWPORT = { width: 1000, height: 800 };
// clampDragOffset's travel range: (viewport - dialog) / 2 - margin(24).
const RANGE_X: number = (VIEWPORT.width - DIALOG_RECT.width) / 2 - 24;
const RANGE_Y: number = (VIEWPORT.height - DIALOG_RECT.height) / 2 - 24;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDraggableDialog", () => {
  it("starts centered with a zero offset", () => {
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: alwaysOpen });
    });

    expect(result.offset()).toEqual({ x: 0, y: 0 });
  });

  it("updates the offset on a pointer drag, clamped to the viewport", () => {
    vi.stubGlobal("innerWidth", VIEWPORT.width);
    vi.stubGlobal("innerHeight", VIEWPORT.height);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: alwaysOpen });
    });
    result.dialogRef(stubDialogEl(DIALOG_RECT));

    result.headerProps.onPointerDown(
      pointerEvent({ clientX: 100, clientY: 100 }),
    );
    result.headerProps.onPointerMove(
      pointerEvent({ clientX: 140, clientY: 130 }),
    );

    expect(result.offset()).toEqual({ x: 40, y: 30 });
    expect(result.dialogStyle().transform).toBe("translate(40px, 30px)");
  });

  it("clamps the offset to the exact travel range at the viewport edge", () => {
    vi.stubGlobal("innerWidth", VIEWPORT.width);
    vi.stubGlobal("innerHeight", VIEWPORT.height);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: alwaysOpen });
    });
    result.dialogRef(stubDialogEl(DIALOG_RECT));

    result.headerProps.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }));
    // Way past the clamped range on both axes.
    result.headerProps.onPointerMove(
      pointerEvent({ clientX: 5000, clientY: 5000 }),
    );

    expect(result.offset()).toEqual({ x: RANGE_X, y: RANGE_Y });
    expect(result.dialogStyle().transform).toBe(
      `translate(${RANGE_X}px, ${RANGE_Y}px)`,
    );
  });

  it("ignores a pointerdown whose direct target carries data-nodrag", () => {
    vi.stubGlobal("innerWidth", VIEWPORT.width);
    vi.stubGlobal("innerHeight", VIEWPORT.height);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: alwaysOpen });
    });
    result.dialogRef(stubDialogEl(DIALOG_RECT));

    const nodragEl = document.createElement("button");
    nodragEl.setAttribute("data-nodrag", "");
    document.body.appendChild(nodragEl);

    result.headerProps.onPointerDown(
      pointerEvent({ clientX: 100, clientY: 100, target: nodragEl }),
    );
    result.headerProps.onPointerMove(
      pointerEvent({ clientX: 140, clientY: 130 }),
    );

    expect(result.offset()).toEqual({ x: 0, y: 0 });
    nodragEl.remove();
  });

  it("ignores a pointerdown originating on a descendant of a data-nodrag element", () => {
    vi.stubGlobal("innerWidth", VIEWPORT.width);
    vi.stubGlobal("innerHeight", VIEWPORT.height);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: alwaysOpen });
    });
    result.dialogRef(stubDialogEl(DIALOG_RECT));

    const nodragEl = document.createElement("button");
    nodragEl.setAttribute("data-nodrag", "");
    const icon = document.createElement("span");
    nodragEl.appendChild(icon);
    document.body.appendChild(nodragEl);

    result.headerProps.onPointerDown(
      pointerEvent({ clientX: 100, clientY: 100, target: icon }),
    );
    result.headerProps.onPointerMove(
      pointerEvent({ clientX: 140, clientY: 130 }),
    );

    expect(result.offset()).toEqual({ x: 0, y: 0 });
    nodragEl.remove();
  });

  it("resets the offset to zero when the dialog closes", () => {
    vi.stubGlobal("innerWidth", VIEWPORT.width);
    vi.stubGlobal("innerHeight", VIEWPORT.height);
    const [open, setOpen] = createSignal(true);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open });
    });
    result.dialogRef(stubDialogEl(DIALOG_RECT));

    result.headerProps.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }));
    result.headerProps.onPointerMove(
      pointerEvent({ clientX: 40, clientY: 20 }),
    );
    expect(result.offset()).toEqual({ x: 40, y: 20 });

    setOpen(false);

    expect(result.offset()).toEqual({ x: 0, y: 0 });
  });
});

// --- test helpers -----------------------------------------------------

function alwaysOpen(): boolean {
  return true;
}

function stubDialogEl(rect: DOMRect): HTMLDivElement {
  const el = document.createElement("div");

  el.getBoundingClientRect = (): DOMRect => {
    return rect;
  };

  return el;
}

interface PointerEventInit {
  clientX: number;
  clientY: number;
  target?: HTMLElement;
}

function pointerEvent(init: PointerEventInit): PointerEvent {
  const target = init.target ?? document.createElement("header");
  const setPointerCapture = vi.fn();

  return {
    pointerId: 1,
    clientX: init.clientX,
    clientY: init.clientY,
    target,
    currentTarget: { setPointerCapture } as unknown as HTMLElement,
  } as unknown as PointerEvent;
}
