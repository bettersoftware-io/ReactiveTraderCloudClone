export interface DragOffset {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Clamp a drag offset so a viewport-centered dialog stays within the viewport
 * by at least `margin` px on every side (keeping its drag-handle header
 * reachable). Pure — the caller supplies measured sizes; no DOM.
 *
 * A centered element can travel (viewport - dialog) / 2 in each direction
 * before its far edge hits the viewport edge; `margin` shrinks that travel.
 * When the dialog is larger than the viewport the travel goes negative, so we
 * floor it at 0 and the dialog holds centered.
 */
export function clampDragOffset(
  next: DragOffset,
  dialog: Size,
  viewport: Size,
  margin: number,
): DragOffset {
  const rangeX = Math.max(0, (viewport.width - dialog.width) / 2 - margin);
  const rangeY = Math.max(0, (viewport.height - dialog.height) / 2 - margin);
  return {
    x: Math.max(-rangeX, Math.min(rangeX, next.x)),
    y: Math.max(-rangeY, Math.min(rangeY, next.y)),
  };
}
