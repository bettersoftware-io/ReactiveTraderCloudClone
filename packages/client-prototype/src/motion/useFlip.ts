import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

// FLIP (First-Last-Invert-Play) glide for grid re-layout: measure the
// [data-flip-key] nodes under `root` before/after a render, and when their
// key changed (e.g. a filter switched which tiles are visible) play a WAAPI
// translate() from the old position to the new one so tiles glide instead of
// jumping (PROTO 856-867).

interface FlipRect {
  left: number;
  top: number;
}

export interface UseFlipOptions {
  reduce?: boolean;
  durMs?: number;
}

const DEFAULT_DUR_MS = 480;
const FLIP_EASING = "cubic-bezier(.22,.85,.3,1)";

function measure(root: HTMLElement): Record<string, FlipRect> {
  const rects: Record<string, FlipRect> = {};

  for (const node of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
    const flipKey = node.getAttribute("data-flip-key");

    if (flipKey != null) {
      const rect = node.getBoundingClientRect();
      rects[flipKey] = { left: rect.left, top: rect.top };
    }
  }

  return rects;
}

function playGlide(
  root: HTMLElement,
  prevRects: Record<string, FlipRect>,
  durMs: number,
): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
    const flipKey = node.getAttribute("data-flip-key");
    const prev = flipKey == null ? undefined : prevRects[flipKey];

    if (prev == null) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    const dx = prev.left - rect.left;
    const dy = prev.top - rect.top;

    if (dx === 0 && dy === 0) {
      continue;
    }

    try {
      node.animate(
        [
          { transform: `translate(${dx}px,${dy}px)` },
          { transform: "translate(0,0)" },
        ],
        { duration: durMs, easing: FLIP_EASING },
      );
    } catch {
      // jsdom (and some older browsers) don't implement Element.animate —
      // skip the glide rather than fail the layout effect (PROTO 862).
    }
  }
}

export function useFlip(
  rootRef: RefObject<HTMLElement | null>,
  key: string,
  opts: UseFlipOptions = {},
): void {
  const { reduce = false, durMs = DEFAULT_DUR_MS } = opts;
  const prevRectsRef = useRef<Record<string, FlipRect>>({});
  const prevKeyRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (root == null) {
      return;
    }

    const keyChanged =
      prevKeyRef.current !== undefined && prevKeyRef.current !== key;

    if (keyChanged && !reduce) {
      playGlide(root, prevRectsRef.current, durMs);
    }

    prevRectsRef.current = measure(root);
    prevKeyRef.current = key;
  });
}
