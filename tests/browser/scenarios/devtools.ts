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

/** Assert a stream row for `streamId` is visible within 10s — the
 *  ContextPane's follow-mode state tree (the old State tab). */
export async function expectStreamRow(
  ctx: TestContext,
  streamId: string,
): Promise<void> {
  await inspector(ctx).waitStreamRow(streamId, 10_000);
}

/** Assert a machine row of the given `kind` is visible within 10s. */
export async function expectMachineOfKind(
  ctx: TestContext,
  kind: string,
): Promise<void> {
  await inspector(ctx).waitMachineRowOfKind(kind, 10_000);
}

/** Select a navigation-tree node by its scope id (spec §3.2) — e.g.
 *  `presenter:blotter` scopes the actions list and State to that presenter;
 *  `machineKind:tileExecution` to that machine kind. `seconds` bounds both the
 *  wait for the node to exist and the click. */
export async function selectNavNode(
  ctx: TestContext,
  nodeId: string,
  seconds: number,
): Promise<void> {
  await inspector(ctx).selectNavNode(nodeId, seconds * 1_000);
}

/** Assert the scoped actions list shows only rows whose text contains
 *  `text` (row summaries carry the stream id), within 10s. */
export async function expectOnlyRowsContaining(
  ctx: TestContext,
  text: string,
): Promise<void> {
  await inspector(ctx).waitTimelineRowsAllContain(text, 10_000);
}

/** Clear (Redux "Commit"): hide everything before now. Returns the watermark
 *  seq so the caller can assert the refill is strictly newer. */
export async function clearTimeline(ctx: TestContext): Promise<number> {
  return inspector(ctx).clearTimeline(10_000);
}

/** Assert Unclear is offered and the list has refilled with rows strictly
 *  newer than `watermark`, within 15s. */
export async function expectTimelineClearedPast(
  ctx: TestContext,
  watermark: number,
): Promise<void> {
  await inspector(ctx).waitTimelineClearedPast(watermark, 15_000);
}

/** Pin the inspector at the NEWEST timeline row's moment (ArrowUp from follow
 *  mode), freezing the context pane on that event's Event/State/Diff. Driven
 *  by keyboard, not a row click: under a live stream the rows are a moving
 *  click target (see the Inspector PO contract), while the shortcut pins
 *  atomically. */
export async function pinLatestTimelineRow(ctx: TestContext): Promise<void> {
  await inspector(ctx).pinLatestTimelineRow(10_000);
}

/** Assert the pinned-moment bar is visible within 10s (a pin is active). */
export async function expectPinnedBar(ctx: TestContext): Promise<void> {
  await inspector(ctx).waitPinnedBar(10_000);
}

/** Assert the pinned-moment bar is gone within 10s (back to following live). */
export async function expectNoPinnedBar(ctx: TestContext): Promise<void> {
  await inspector(ctx).waitNoPinnedBar(10_000);
}

/** Press Escape on the inspector page — the shortcut that resumes from a
 *  pinned moment back to the live tail. */
export async function resumeViaEscape(ctx: TestContext): Promise<void> {
  await inspector(ctx).resumeViaEscape();
}

/** Close the app page — the graceful teardown that drives the inspector back to
 *  "disconnected". */
export async function closeApp(ctx: TestContext): Promise<void> {
  await inspector(ctx).closeAppPage();
}
