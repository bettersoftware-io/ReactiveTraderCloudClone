/**
 * Unit test for the pointer-seam hook behind the draggable Preferences
 * dialog (Task 14). The pure clamp math (`clampDragOffset`, Task 13) is
 * covered in `@rtc/motion-core`; this file only exercises the hook's own
 * responsibilities — pointer bookkeeping, the `data-nodrag` guard, and the
 * open/close reset — so the dialog rect and viewport are stubbed to fixed,
 * deterministic sizes.
 */
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDraggableDialog } from "./useDraggableDialog";

const DIALOG_RECT = { width: 400, height: 300 } as DOMRect;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDraggableDialog", () => {
  it("starts centered with a zero offset", () => {
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: true });
    });

    expect(result.current.offset).toEqual({ x: 0, y: 0 });
  });

  it("updates the offset on a pointer drag, clamped to the viewport", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: true });
    });
    stubDialogRect(result.current.dialogRef, DIALOG_RECT);

    act(() => {
      result.current.headerProps.onPointerDown(
        pointerEvent({ clientX: 100, clientY: 100 }),
      );
    });
    act(() => {
      result.current.headerProps.onPointerMove(
        pointerEvent({ clientX: 140, clientY: 130 }),
      );
    });

    expect(result.current.offset).toEqual({ x: 40, y: 30 });
    expect(result.current.dialogStyle.transform).toBe("translate(40px, 30px)");
  });

  it("clamps the offset so the dialog never leaves the viewport", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: true });
    });
    stubDialogRect(result.current.dialogRef, DIALOG_RECT);

    act(() => {
      result.current.headerProps.onPointerDown(
        pointerEvent({ clientX: 0, clientY: 0 }),
      );
    });
    act(() => {
      // Way past the clamped range — (1000-400)/2 - margin on X.
      result.current.headerProps.onPointerMove(
        pointerEvent({ clientX: 5000, clientY: 5000 }),
      );
    });

    // Exact clamped range = (viewport - dialog) / 2 - DRAG_MARGIN:
    //   x: (1000 - 400) / 2 - 24 = 276 ;  y: (800 - 300) / 2 - 24 = 226
    const { offset } = result.current;
    expect(offset.x).toBe(276);
    expect(offset.y).toBe(226);
  });

  it("ignores a pointerdown that originates on a data-nodrag element", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const { result } = renderHook(() => {
      return useDraggableDialog({ open: true });
    });
    stubDialogRect(result.current.dialogRef, DIALOG_RECT);

    const nodragEl = document.createElement("button");
    nodragEl.setAttribute("data-nodrag", "");
    document.body.appendChild(nodragEl);

    act(() => {
      result.current.headerProps.onPointerDown(
        pointerEvent({ clientX: 100, clientY: 100, target: nodragEl }),
      );
    });
    act(() => {
      result.current.headerProps.onPointerMove(
        pointerEvent({ clientX: 140, clientY: 130 }),
      );
    });

    expect(result.current.offset).toEqual({ x: 0, y: 0 });
    nodragEl.remove();
  });

  it("resets the offset to zero when the dialog closes", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const { result, rerender } = renderHook(
      (props: RenderHookProps) => {
        return useDraggableDialog({ open: props.open });
      },
      { initialProps: { open: true } },
    );
    stubDialogRect(result.current.dialogRef, DIALOG_RECT);

    act(() => {
      result.current.headerProps.onPointerDown(
        pointerEvent({ clientX: 0, clientY: 0 }),
      );
    });
    act(() => {
      result.current.headerProps.onPointerMove(
        pointerEvent({ clientX: 40, clientY: 20 }),
      );
    });
    expect(result.current.offset).toEqual({ x: 40, y: 20 });

    rerender({ open: false });

    expect(result.current.offset).toEqual({ x: 0, y: 0 });
  });
});

// --- test helpers -----------------------------------------------------

function stubDialogRect(
  ref: RefObject<HTMLDivElement | null>,
  rect: DOMRect,
): void {
  const el = document.createElement("div");

  el.getBoundingClientRect = (): DOMRect => {
    return rect;
  };

  // The hook only reads dialogRef.current at drag time — assigning it
  // directly stands in for the `ref={dialogRef}` wiring a real render does.
  ref.current = el;
}

interface RenderHookProps {
  open: boolean;
}

interface PointerEventInit {
  clientX: number;
  clientY: number;
  target?: HTMLElement;
}

function pointerEvent(init: PointerEventInit): ReactPointerEvent<HTMLElement> {
  const target = init.target ?? document.createElement("header");
  const setPointerCapture = vi.fn();
  return {
    pointerId: 1,
    clientX: init.clientX,
    clientY: init.clientY,
    target,
    currentTarget: { setPointerCapture } as unknown as HTMLElement,
  } as unknown as ReactPointerEvent<HTMLElement>;
}
