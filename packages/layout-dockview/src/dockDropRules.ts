export type DockDropPosition = "top" | "bottom" | "left" | "right" | "center";

/** Where a drop lands: the outer edge of the whole layout, or one group
 * (whose `lock` is its panels' shared `fixedWidth`, undefined if free). */
export type DockDropTarget =
  | { readonly kind: "layout-edge"; readonly position: DockDropPosition }
  | {
      readonly kind: "group";
      readonly position: DockDropPosition;
      readonly lock: number | undefined;
    };

/** Ruling R5 — the invariant it protects: a group never mixes widths, and
 * a column never holds a locked group beside anything that must stretch.
 * A locked panel may start its own column (a left/right drop), stack onto
 * or above/below a group locked at the SAME width, and nothing else; a
 * free panel may go anywhere except onto a locked group. A top/bottom drop
 * on the whole layout's edge makes a full-width row, which a lock would
 * pin the entire dock to — refused for a locked panel. */
export function refusesDockDrop(
  draggedLock: number | undefined,
  target: DockDropTarget,
): boolean {
  const vertical = target.position === "top" || target.position === "bottom";

  if (target.kind === "layout-edge") {
    return draggedLock !== undefined && vertical;
  }

  if (target.lock !== undefined) {
    return (
      draggedLock !== target.lock || !(vertical || target.position === "center")
    );
  }

  return (
    draggedLock !== undefined && (vertical || target.position === "center")
  );
}
