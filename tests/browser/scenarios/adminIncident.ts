// tests/browser/scenarios/adminIncident.ts
//
// Driver-agnostic scenario helpers for the Admin incident injection flow.
// Consume through the WorkspacePO + ConnectionOverlayPO contracts only —
// no direct page.* or ctx.po.* in native Playwright test bodies (gates 10/11).
import { TESTIDS } from "../page-objects/contracts/testids";
import type { TestContext } from "../testContext";
import * as connection from "./connection";

/** Navigate to the Admin tab (workspace must already be open). */
export async function navigateToAdmin(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.clickTab("admin");
}

/**
 * Click the inject button for the given incident kind.
 * Pass TESTIDS.admin.incident.inject(kind) through WorkspacePO.clickTestId
 * so no raw testid string appears in the scenario layer (gate 1).
 */
export async function injectIncident(
  ctx: TestContext,
  kind: string,
): Promise<void> {
  await ctx.po.workspace.clickTestId(TESTIDS.admin.incident.inject(kind));
}

/**
 * Click the "Clear incident" button on the connection overlay to dismiss the
 * active incident. The overlay button is in the visible foreground, so no
 * force click is needed.
 */
export async function clearIncident(ctx: TestContext): Promise<void> {
  await ctx.po.connectionOverlay.clearIncident();
}

/**
 * Assert the connection overlay becomes visible within `seconds` seconds
 * (reuses the shared connection scenario helper).
 */
export async function expectConnectionBannerVisible(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await connection.expectConnectionOverlayVisibleWithin(ctx, seconds);
}

/**
 * Assert the connection overlay is hidden within `seconds` seconds
 * (reuses the shared connection scenario helper).
 */
export async function expectConnectionRestored(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await connection.expectConnectionOverlayHiddenWithin(ctx, seconds);
}
