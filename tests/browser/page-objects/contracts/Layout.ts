/**
 * Drives the in-house layout engine's resizable split panes. The reducer-level
 * resize maths is unit-tested; this PO exists to drive the *DOM-geometry*
 * pointer-drag of a splitter handle end-to-end (the one spot the engine is
 * framework-coupled), which no unit/contract test exercises.
 */
export interface LayoutPO {
  /** How many draggable splitter handles are currently rendered. */
  handleCount(): Promise<number>;
  /** The first splitter handle's size fraction (its `aria-valuenow`, 0..1). */
  firstHandleSize(): Promise<number>;
  /** Pointer-drag the first splitter handle along its axis by `dx` CSS pixels. */
  dragFirstHandleBy(dx: number): Promise<void>;
}
