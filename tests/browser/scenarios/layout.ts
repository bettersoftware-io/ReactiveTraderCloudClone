import type { TestContext } from "../testContext";
import { assertGreaterThanZero, assertTrue } from "./assert";

// Drag the first splitter boundary a healthy distance along its axis; large
// enough that the resulting size-fraction change clears the assertion margin
// regardless of the exact container width.
const DRAG_PX = -140;
const MIN_FRACTION_DELTA = 0.02;

/**
 * Proves the layout engine's DOM-geometry pointer-drag actually resizes panels:
 * grab the first splitter handle, drag it, and assert its size fraction
 * (`aria-valuenow`) moved. This is the one engine path no unit/contract test
 * covers (the reducer maths is unit-tested; the drag wiring is not).
 */
export async function expectSplitterDragResizes(
  ctx: TestContext,
): Promise<void> {
  assertGreaterThanZero(
    await ctx.po.layout.handleCount(),
    "expected at least one draggable splitter handle in the FX layout",
  );

  const before = await ctx.po.layout.firstHandleSize();
  await ctx.po.layout.dragFirstHandleBy(DRAG_PX);
  const after = await ctx.po.layout.firstHandleSize();

  assertTrue(
    Math.abs(after - before) > MIN_FRACTION_DELTA,
    `expected the splitter size fraction to change by more than ${MIN_FRACTION_DELTA} after dragging (before=${before}, after=${after})`,
  );
}
