import {
  CORE_IMPLS,
  type CoreImpl as CoreImplName,
} from "#/scripts/lib/coreImpl.ts";

import type { PrefsCoreImpl } from "../page-objects/contracts/Preferences.ts";
import type { TestContext } from "../testContext.ts";
import { findBootFailure } from "./login.ts";

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

/** Waits for the real navigation `createCoreSelection().select()` performs
 *  once a choice is persisted, landing on a URL with `?core=` stripped. */
export async function expectUrlHasNoCoreParam(
  ctx: TestContext,
  timeoutMs: number,
): Promise<void> {
  await ctx.po.workspace.waitUrlHasNoCoreParam(timeoutMs);
}
