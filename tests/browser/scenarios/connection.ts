import type { TestContext } from "../testContext";
import { assertTrue } from "./assert";

export async function setBrowserOffline(
  ctx: TestContext,
  offline: boolean,
): Promise<void> {
  await ctx.po.workspace.setOffline(offline);
}

export async function expectConnectionStatusFooterVisible(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.footer.isStatusVisible(),
    "connection status footer not visible",
  );
}

export async function expectConnectionStatusFooterShows(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  // Poll up to 5s for the footer to reflect the expected label. expect.poll's
  // role is filled by a hand-rolled loop here so scenarios stay driver-free.
  const deadline = Date.now() + 5_000;
  let last = "";

  while (Date.now() < deadline) {
    last = await ctx.po.footer.connectionLabel();
    if (last.includes(expected)) return;
    await ctx.po.workspace.wait(100);
  }

  throw new Error(
    `expected footer to contain ${JSON.stringify(expected)} within 5s; last seen: ${JSON.stringify(last)}`,
  );
}

export async function expectConnectionOverlayHidden(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.connectionOverlay.isHidden(),
    "connection overlay not hidden",
  );
}

export async function expectConnectionOverlayVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.connectionOverlay.waitVisible(seconds * 1_000);
}

export async function expectConnectionOverlayHiddenWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.connectionOverlay.waitHidden(seconds * 1_000);
}

export async function expectConnectionOverlayTextMatches(
  ctx: TestContext,
  rawRegex: string,
): Promise<void> {
  const match = rawRegex.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!match) throw new Error(`bad regex literal: ${rawRegex}`);
  const re = new RegExp(match[1], match[2]);
  const text = await ctx.po.connectionOverlay.text();

  if (!re.test(text)) {
    throw new Error(`expected ${JSON.stringify(text)} to match ${rawRegex}`);
  }
}
