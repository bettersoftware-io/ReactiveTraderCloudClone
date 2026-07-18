import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useRef,
  useState,
} from "react";

import { clampDragOffset, type DragOffset } from "@rtc/motion-core";

// Minimum breathing room (px) kept between the dialog and the viewport edge
// on every side, so its drag-handle header always stays reachable.
const DRAG_MARGIN = 24;

const ZERO_OFFSET: DragOffset = { x: 0, y: 0 };

/**
 * Framework shell around the pure `clampDragOffset` (ADR-005): this hook
 * owns the DOM-facing pointer seam (drag-origin bookkeeping, the dialog's
 * measured rect, the viewport size) and delegates the actual clamp math to
 * `@rtc/motion-core`. No persisted state — `offset` resets to `{0,0}`
 * whenever `open` goes false, so reopening the dialog re-centers it.
 *
 * Consumers spread `headerProps` onto the dialog's header (drag handle) and
 * attach `dialogRef` + `dialogStyle` to the dialog panel itself. A
 * `pointerdown` whose target (or an ancestor within the header) carries
 * `data-nodrag` is ignored — that's how the ✕ close button opts out of
 * starting a drag.
 */
export function useDraggableDialog({
  open,
}: UseDraggableDialogOptions): UseDraggableDialogResult {
  const [offset, setOffset] = useState<DragOffset>(ZERO_OFFSET);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);

  // Reset on close, computed during render rather than in an effect (React's
  // recommended "adjusting state when a prop changes" pattern — a state
  // variable tracks the previous `open`, not a ref: refs must not be read
  // or written during render). No drag can be in flight once the dialog's
  // JSX unmounts, so only `offset` needs the reset here.
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);

    if (!open) {
      setOffset(ZERO_OFFSET);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;

    if (target.closest("[data-nodrag]")) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: offset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    const dialogEl = dialogRef.current;

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

  function endDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  return {
    offset,
    dialogRef,
    headerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    dialogStyle: { transform: `translate(${offset.x}px, ${offset.y}px)` },
  };
}

export interface UseDraggableDialogOptions {
  /** Whether the dialog is currently open — closing resets the offset. */
  open: boolean;
}

export interface UseDraggableDialogResult {
  offset: DragOffset;
  /** Attach to the dialog panel — its measured rect drives the clamp. */
  dialogRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the dialog's header (the drag handle). */
  headerProps: DraggableDialogHeaderProps;
  /** Apply to the dialog panel; carries the live drag `transform`. */
  dialogStyle: CSSProperties;
}

export interface DraggableDialogHeaderProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface DragOrigin {
  pointerId: number;
  startX: number;
  startY: number;
  originOffset: DragOffset;
}
