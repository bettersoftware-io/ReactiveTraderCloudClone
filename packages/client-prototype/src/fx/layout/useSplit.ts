import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// Pointer-drag resizable split (PROTO 1185 startSplit): the handle records the
// pointer's start coordinate, the ratio it started at, and the container's
// current size, then on every pointermove converts pixel delta into a ratio
// delta by dividing by that size. Persists the final ratio to localStorage so
// the layout survives a reload (PROTO 824 fxStackR/asideW/fxRightR).
//
// jsdom implements neither real pointer-capture nor layout, so every capture
// call is guarded (`typeof target.setPointerCapture === "function"`) and the
// geometry is driven purely by `clientX`/`clientY` deltas and a mocked
// `getBoundingClientRect` — never by measuring the handle itself.

export interface SplitApi {
  ratio: number;
  handleProps: {
    onPointerDown(e: ReactPointerEvent): void;
    role: "separator";
    "data-orientation": "h" | "v";
  };
}

export interface UseSplitOptions {
  storageKey: string;
  orientation: "h" | "v";
  initial: number;
  min?: number;
  containerRef: RefObject<HTMLElement | null>;
}

// jsdom has no PointerCapture implementation on Element — both methods are
// optional here so real elements (guarded, no-op) and the test's stub target
// (present, spyable) both type-check.
interface CaptureTarget {
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

interface DragState {
  target: CaptureTarget;
  pointerId: number;
  startCoord: number;
  startRatio: number;
  size: number;
}

const DEFAULT_MIN = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredRatio(storageKey: string, fallback: number): number {
  const stored = localStorage.getItem(storageKey);
  const parsed = stored == null ? Number.NaN : Number.parseFloat(stored);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

function coordFor(orientation: "h" | "v", point: ClientPoint): number {
  return orientation === "v" ? point.clientX : point.clientY;
}

function sizeFor(orientation: "h" | "v", rect: DOMRect): number {
  return orientation === "v" ? rect.width : rect.height;
}

export function useSplit(opts: UseSplitOptions): SplitApi {
  const {
    storageKey,
    orientation,
    initial,
    min = DEFAULT_MIN,
    containerRef,
  } = opts;
  const [ratio, setRatio] = useState(() => {
    return clamp(readStoredRatio(storageKey, initial), min, 1 - min);
  });
  // onPointerDown/handleMove/handleUp are stable callbacks (window listeners
  // rebind per drag), so they read the live ratio through a ref rather than
  // closing over the `ratio` state value.
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  const dragRef = useRef<DragState | null>(null);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      const delta = (coordFor(orientation, e) - drag.startCoord) / drag.size;
      setRatio(clamp(drag.startRatio + delta, min, 1 - min));
    },
    [orientation, min],
  );

  const handleUp = useCallback(() => {
    const drag = dragRef.current;

    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);

    if (drag && typeof drag.target.releasePointerCapture === "function") {
      drag.target.releasePointerCapture(drag.pointerId);
    }

    dragRef.current = null;
    localStorage.setItem(storageKey, String(ratioRef.current));
  }, [storageKey, handleMove]);

  // Belt-and-braces: a leaked window listener from an unmount mid-drag would
  // fail unrelated tests, so remove both on unmount too, not just on pointerup.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [handleMove, handleUp]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const target = e.currentTarget as unknown as CaptureTarget;

      if (typeof target.setPointerCapture === "function") {
        target.setPointerCapture(e.pointerId);
      }

      const rect = containerRef.current?.getBoundingClientRect();

      dragRef.current = {
        target,
        pointerId: e.pointerId,
        startCoord: coordFor(orientation, e),
        startRatio: ratioRef.current,
        size: rect ? sizeFor(orientation, rect) : 1,
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [orientation, containerRef, handleMove, handleUp],
  );

  return {
    ratio,
    handleProps: {
      onPointerDown,
      role: "separator",
      "data-orientation": orientation,
    },
  };
}
