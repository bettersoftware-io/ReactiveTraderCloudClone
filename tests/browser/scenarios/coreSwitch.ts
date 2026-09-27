import type { PrefsCoreImpl } from "../page-objects/contracts/Preferences";
import type { TestContext } from "../testContext";

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
 *  `timeoutMs` — the application core the app actually booted on. */
export async function expectBootedCoreImpl(
  ctx: TestContext,
  expected: string,
  timeoutMs: number,
): Promise<void> {
  await ctx.po.workspace.waitCoreImpl(expected, timeoutMs);
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
