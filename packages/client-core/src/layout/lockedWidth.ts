import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-logic";

/** The width every panel under `node` is locked at (`PanelSpec.fixedWidthPx`),
 * or `undefined` when any panel under it is unlocked, unknown, or locked at
 * a different width — a split only renders locked when ALL of its panels
 * agree, since one free panel inside would have to stretch with it. Pure
 * render-time policy, like `maximizeBoundaryPath`: LayoutState and the
 * layout machine know nothing of locks. */
export function lockedWidthPx(
  node: LayoutNode,
  specs: Readonly<Record<PanelId, PanelSpec>>,
): number | undefined {
  if (node.kind === "panel") {
    return specs[node.panelId]?.fixedWidthPx;
  }

  const widths = node.children.map((child) => {
    return lockedWidthPx(child, specs);
  });
  const first = widths[0];

  return first !== undefined &&
    widths.every((width) => {
      return width === first;
    })
    ? first
    : undefined;
}
