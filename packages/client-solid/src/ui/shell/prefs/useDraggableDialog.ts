import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
} from "solid-js";

import { clampDragOffset, type DragOffset } from "@rtc/motion-core";

// Minimum breathing room (px) kept between the dialog and the viewport edge
// on every side, so its drag-handle header always stays reachable.
const DRAG_MARGIN = 24;

const ZERO_OFFSET: DragOffset = { x: 0, y: 0 };

/**
 * Framework shell around the pure `clampDragOffset` (ADR-005): this primitive
 * owns the DOM-facing pointer seam (drag-origin bookkeeping, the dialog's
 * measured rect, the viewport size) and delegates the actual clamp math to
 * `@rtc/motion-core`. No persisted state — `offset` resets to `{0,0}`
 * whenever `open()` goes false, so reopening the dialog re-centers it.
 *
 * SOLID PORT NOTE: the React original resets on close via the "adjust state
 * during render" recipe (comparing against a stored previous `open`, since
 * refs must not be read/written during render). Solid has no such
 * constraint — a plain `createEffect` reading `options.open()` reruns
 * exactly when it changes and resets `offset` directly.
 *
 * Consumers spread `headerProps` onto the dialog's header (drag handle) and
 * attach `dialogRef` (a callback ref) + `dialogStyle()` to the dialog panel
 * itself. A `pointerdown` whose target (or an ancestor within the header)
 * carries `data-nodrag` is ignored — that's how the ✕ close button opts out
 * of starting a drag.
 */
export function useDraggableDialog(
  options: UseDraggableDialogOptions,
): UseDraggableDialogResult {
  const [offset, setOffset] = createSignal<DragOffset>(ZERO_OFFSET);
  let dialogEl: HTMLDivElement | undefined;
  let drag: DragOrigin | null = null;

  createEffect(() => {
    if (!options.open()) {
      setOffset(ZERO_OFFSET);
    }
  });

  function dialogRef(el: HTMLDivElement): void {
    dialogEl = el;
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest("[data-nodrag]")) {
      return;
    }

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: offset(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId || !dialogEl) {
      return;
    }

    const dialogRect = dialogEl.getBoundingClientRect();
    const raw: DragOffset = {
      x: drag.originOffset.x + (event.clientX - drag.startX),
      y: drag.originOffset.y + (event.clientY - drag.startY),
    };

    setOffset(
      clampDragOffset(
        raw,
        { width: dialogRect.width, height: dialogRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        DRAG_MARGIN,
      ),
    );
  }

  function endDrag(event: PointerEvent): void {
    if (drag?.pointerId === event.pointerId) {
      drag = null;
    }
  }

  // A literal `translate(Xpx, Ypx)` string, not `--drag-x`/`--drag-y` custom
  // properties consumed by `translate(var(...))` — the latter is NOT
  // compositor-resolvable and falls back to the main thread (docs/performance.md
  // T4). Wrapped in a memo (not the bare `offset()` object) purely so
  // repeated reads of an unchanged offset return the same style reference.
  const dialogStyle = createMemo((): JSX.CSSProperties => {
    const { x, y } = offset();

    return { transform: `translate(${x}px, ${y}px)` };
  });

  return {
    offset,
    dialogRef,
    headerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    dialogStyle,
  };
}

export interface UseDraggableDialogOptions {
  /** Whether the dialog is currently open — closing resets the offset. */
  open: Accessor<boolean>;
}

export interface UseDraggableDialogResult {
  offset: Accessor<DragOffset>;
  /** Attach via `ref={dialogRef}` on the dialog panel — its measured rect
   *  drives the clamp. */
  dialogRef: (el: HTMLDivElement) => void;
  /** Spread onto the dialog's header (the drag handle). */
  headerProps: DraggableDialogHeaderProps;
  /** Apply via `style={dialogStyle()}`; carries the live drag `transform`. */
  dialogStyle: Accessor<JSX.CSSProperties>;
}

interface DraggableDialogHeaderProps {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
}

interface DragOrigin {
  pointerId: number;
  startX: number;
  startY: number;
  originOffset: DragOffset;
}
