import type { InspectorPO } from "../page-objects/contracts/Inspector";
import type { TestContext } from "../testContext";
import * as common from "./common";

/** Narrow `ctx.po.inspector` (optional on the shared contract — Playwright-only)
 *  to a present PO, failing loudly under a driver that does not provide it. */
function inspector(ctx: TestContext): InspectorPO {
  if (ctx.po.inspector === undefined) {
    throw new Error(
      "inspector page object is not available under this driver (Playwright-only)",
    );
  }

  return ctx.po.inspector;
}

/**
 * Open the app on the FX workspace and wait for a live tile. Mounting the FX
 * tiles is what births the `tileExecution` machines the inspector will later
 * list, so the wait is a precondition, not a nicety.
 */
export async function openAppOnFxWorkspace(ctx: TestContext): Promise<void> {
  await common.openFxWorkspace(ctx);
  await ctx.po.liveRatesTile.waitForFirstTile(10_000);
}

/** Open the inspector as a second same-origin page at `/devtools/`. */
export async function openInspector(ctx: TestContext): Promise<void> {
  await inspector(ctx).open();
}

/** Assert the inspector's connection badge settles to `expected` within
 *  `seconds` (the app id once handshaken, or "disconnected"). */
export async function expectInspectorBadge(
  ctx: TestContext,
  expected: string,
  seconds: number,
): Promise<void> {
  await inspector(ctx).waitConnectionBadge(expected, seconds * 1_000);
}

/** Assert a State-tab stream row for `streamId` is visible within 10s. */
export async function expectStreamRow(
  ctx: TestContext,
  streamId: string,
): Promise<void> {
  await inspector(ctx).waitStreamRow(streamId, 10_000);
}

/** Switch the inspector to its Machines tab, allowing the click up to
 *  `seconds` (the inspector's main thread is busy rendering the live stream, so
 *  the click's actionability polling needs a generous, explicit budget). */
export async function openMachinesTab(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await inspector(ctx).openMachinesTab(seconds * 1_000);
}

/** Assert a machine row of the given `kind` is visible within 10s. */
export async function expectMachineOfKind(
  ctx: TestContext,
  kind: string,
): Promise<void> {
  await inspector(ctx).waitMachineRowOfKind(kind, 10_000);
}

/** Close the app page — the graceful teardown that drives the inspector back to
 *  "disconnected". */
export async function closeApp(ctx: TestContext): Promise<void> {
  await inspector(ctx).closeAppPage();
}
