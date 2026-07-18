import type { BootOpenOptions, BootPO } from "../page-objects/contracts/Boot";
import type { TestContext } from "../testContext";

// Assertion budget: the boot machine's `done` transition (BOOT_DURATION_MS =
// 4200ms in BootSequenceMachine.ts) dismisses the whole boot-sequence root
// once reduced-motion is active and NOT forced. Both waits below resolve
// almost immediately after navigation (the attribute/CSS are correct from
// first paint), well inside that window — kept short so a genuine hang or a
// dismissal race fails fast rather than idling out near the boundary.
const DEFAULT_TIMEOUT_MS = 3_000;

function bootPO(ctx: TestContext): BootPO {
  const po = ctx.po.boot;

  if (po === undefined) {
    throw new Error(
      "boot page object not available on this driver (Playwright-only)",
    );
  }

  return po;
}

/** Navigate to "/?splash", optionally seeding the forceBootAnimation
 *  preference beforehand. Pre-auth: BootGate mounts outside AuthGate, so this
 *  is identical on react and solid regardless of login state. */
export async function openBoot(
  ctx: TestContext,
  options?: BootOpenOptions,
): Promise<void> {
  await bootPO(ctx).open(options);
}

export async function expectForceAnimAttr(
  ctx: TestContext,
  expected: "true" | "false",
): Promise<void> {
  await bootPO(ctx).waitForceAnimAttr(expected, DEFAULT_TIMEOUT_MS);
}

export async function expectCanvasVisible(ctx: TestContext): Promise<void> {
  await bootPO(ctx).waitCanvasVisible(DEFAULT_TIMEOUT_MS);
}

export async function expectCanvasHidden(ctx: TestContext): Promise<void> {
  await bootPO(ctx).waitCanvasHidden(DEFAULT_TIMEOUT_MS);
}
