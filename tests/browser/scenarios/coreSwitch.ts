import {
  CORE_IMPLS,
  type CoreImpl as CoreImplName,
} from "#/scripts/lib/coreImpl.ts";

import type { PrefsCoreImpl } from "../page-objects/contracts/Preferences.ts";
import type { TestContext } from "../testContext.ts";
import { assertEquals, assertFalse, assertTrue } from "./assert.ts";
import { findBootFailure } from "./login.ts";

// PANEL_SPECS' FX panel ids (packages/core-logic/src/layout/defaultLayoutPort.ts).
const ANALYTICS_PANEL_ID = "fx-analytics";
const BLOTTER_PANEL_ID = "fx-blotter";

// A notional no other trade in the journey uses, so finding it in the
// blotter can only mean THIS trade survived the swap.
const TRADE_NOTIONAL = "1234567";

// How long a swap may take to land: fetch the next core's lazy chunk (from
// the served production build; a dev-server transform on its first request
// under RTC_E2E_SERVE=dev), compose it, mount the UI. Matches the budget
// `expectBootedCoreImpl` gets for a full page load.
const SWAP_TIMEOUT_MS = 10_000;

// Once `data-core-impl` has flipped, the swapped composition is mounted:
// what it shows should already be there, give or take a render.
const SETTLED_TIMEOUT_MS = 3_000;

// The brief's bound: a tile must tick again within 5 s of the swap.
const PRICE_TICK_TIMEOUT_MS = 5_000;

export interface DistinctCores {
  /** The `?core=` value for the journey's very first load. */
  readonly start: CoreImplName;
  /** The value saved via Preferences partway through the journey. */
  readonly stored: CoreImplName;
}

/**
 * Picks the two application cores (of the three that exist) that both differ
 * from `buildDefault` — and from each other — for the round trip's "start"
 * and "stored" steps. Needed because a CI job's own build default
 * (`RTC_CORE_IMPL`, e.g. the async e2e job defaults to `"async"`) can
 * coincide with a value this journey would otherwise hardcode: "the stored
 * choice survives a reload" and "an unknown ?core= falls back to the stored
 * choice" both boot on `stored` with no `?core=` present, which is
 * indistinguishable from "booted on the build default" unless `stored` is
 * provably NOT the build default in every job. `buildDefault` itself doubles
 * as the later `?core=` override value (see coreSwitch.spec.ts) — since
 * `start`/`stored`/`buildDefault` are then the three distinct impls, that
 * override is automatically `!== stored` too.
 */
export function pickDistinctCores(buildDefault: string): DistinctCores {
  const remaining = CORE_IMPLS.filter((impl) => {
    return impl !== buildDefault;
  });

  if (remaining.length !== 2) {
    throw new Error(
      `expected exactly 2 cores distinct from build default "${buildDefault}", got ${remaining.length}: ${remaining.join(", ")}`,
    );
  }

  const [stored, start] = remaining;
  return { start, stored };
}

/** Navigate to "/?core=<impl>" — the load-time `?core=` override, highest in
 *  `resolveCoreChoice`'s precedence chain and never persisted. `impl` is a
 *  raw string so callers can also exercise an unrecognized value. */
export async function openWithCoreImplParam(
  ctx: TestContext,
  impl: string,
): Promise<void> {
  await ctx.po.workspace.openWithCoreImpl(impl);
}

/** Assert the document root's `data-core-impl` reads `expected` within
 *  `timeoutMs` — the application core the app actually booted on. On timeout,
 *  surfaces a captured VITE_CORE_IMPL boot failure (see `login.ts`'s
 *  `findBootFailure`) instead of an opaque locator-timeout message. */
export async function expectBootedCoreImpl(
  ctx: TestContext,
  expected: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await ctx.po.workspace.waitCoreImpl(expected, timeoutMs);
  } catch (error) {
    const boot = findBootFailure(ctx);

    if (boot !== undefined) {
      throw new Error(`the app failed to boot: ${boot}`, { cause: error });
    }

    throw error;
  }
}

/** Opens the account menu's Preferences modal and waits for it to render. */
export async function openPreferences(ctx: TestContext): Promise<void> {
  await ctx.po.preferences.open();
  await ctx.po.preferences.waitModalVisible(3_000);
}

/** Clicks the Application core segment row's `value` option. */
export async function selectCoreImpl(
  ctx: TestContext,
  value: PrefsCoreImpl,
): Promise<void> {
  await ctx.po.preferences.selectCoreImpl(value);
}

/**
 * Leaves state behind in every layer a core swap could lose: on the FX tab,
 * a trade in the blotter (the core's blotter fold), the blotter floated (the
 * dock blob) and the analytics panel collapsed (the workspace layout). The
 * collapse goes LAST, so its debounced persistence write may still be
 * pending when the swap starts — a swap that dropped it would show.
 */
export async function prepareDesk(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.clickTab("fx");
  await ctx.po.liveRatesTile.waitForFirstTileLiveRate(5_000);

  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([BLOTTER_PANEL_ID], SETTLED_TIMEOUT_MS);

  await ctx.po.liveRatesTile.fillFirstTileNotional(TRADE_NOTIONAL);
  await ctx.po.liveRatesTile.clickBuyOnFirst();
  await ctx.po.liveRatesTile.dismissConfirmationOnceSettled();
  await expectTradeInBlotter(ctx);

  await ctx.po.layout.collapsePanel(ANALYTICS_PANEL_ID);
  await ctx.po.layout.waitDockCollapsed(
    [ANALYTICS_PANEL_ID],
    SETTLED_TIMEOUT_MS,
  );
}

/** Marks the current document (no navigation may happen from here on
 *  without the mark vanishing) and starts watching for a login screen. */
export async function armSwapWitnesses(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.setNavigationMark();
  await ctx.po.workspace.watchForLoginScreen();
}

/**
 * Asserts a Preferences core choice of `impl` swapped the core in place:
 * the document root names `impl`, the user was never signed out (checked
 * first, the moment the swap lands, and against every frame since
 * {@link armSwapWitnesses}), the page never navigated, `?core=` is gone,
 * Preferences is open again with `impl` selected, and the desk
 * {@link prepareDesk} left behind is intact and live.
 */
export async function expectSwappedInPlace(
  ctx: TestContext,
  impl: PrefsCoreImpl,
): Promise<void> {
  await expectBootedCoreImpl(ctx, impl, SWAP_TIMEOUT_MS);

  await ctx.po.workspace.waitSignedIn(SETTLED_TIMEOUT_MS);
  assertFalse(
    await ctx.po.workspace.loginScreenSeen(),
    `the login screen was on screen during the swap to ${impl}`,
  );

  assertEquals(
    await ctx.po.workspace.navigationMark(),
    1,
    `the page navigated during the swap to ${impl}`,
  );
  await ctx.po.workspace.waitUrlHasNoCoreParam(SETTLED_TIMEOUT_MS);

  await ctx.po.preferences.waitModalVisible(SETTLED_TIMEOUT_MS);
  await ctx.po.preferences.waitCoreImplSelected(impl, SETTLED_TIMEOUT_MS);

  await expectTradeInBlotter(ctx);
  await expectDeskLayout(ctx);
  // The first price before the baseline: a tile going from its placeholder
  // to its first price is not a tick.
  await ctx.po.liveRatesTile.waitForFirstTileLiveRate(PRICE_TICK_TIMEOUT_MS);
  await ctx.po.liveRatesTile.waitFirstTilePriceChange(PRICE_TICK_TIMEOUT_MS);
}

/** Asserts the last step was a real navigation (the mark is gone — the
 *  positive witness that the mark detects one) and that the desk's layout
 *  reached storage, not only the swapped core's memory. */
export async function expectDeskSurvivedReload(
  ctx: TestContext,
): Promise<void> {
  assertEquals(
    await ctx.po.workspace.navigationMark(),
    undefined,
    "the navigation mark survived a reload: it cannot witness a navigation",
  );
  await ctx.po.workspace.clickTab("fx");
  await expectDeskLayout(ctx);
}

/** The blotter holds the trade {@link prepareDesk} executed. */
async function expectTradeInBlotter(ctx: TestContext): Promise<void> {
  const formatted = Number(TRADE_NOTIONAL).toLocaleString("en-US");
  await ctx.po.blotterTable.expectContainsText(formatted, 10_000);
}

/** Analytics is a strip and the blotter floats — the engine's bookkeeping
 *  AND the DOM (the group really sits in dockview's float container). */
async function expectDeskLayout(ctx: TestContext): Promise<void> {
  await ctx.po.layout.waitDockCollapsed(
    [ANALYTICS_PANEL_ID],
    SETTLED_TIMEOUT_MS,
  );
  await ctx.po.layout.waitDockFloating([BLOTTER_PANEL_ID], SETTLED_TIMEOUT_MS);
  assertTrue(
    await ctx.po.layout.panelSitsInFloat(BLOTTER_PANEL_ID),
    "expected fx-blotter inside dockview's float container",
  );
}
