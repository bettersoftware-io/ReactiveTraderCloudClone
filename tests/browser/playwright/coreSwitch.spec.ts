// tests/browser/playwright/coreSwitch.spec.ts
//
// End-to-end round trip of the load-time application-core switch
// (docs/superpowers/specs/2026-09-27-runtime-core-switch-design.md):
// `?core=` overrides for one load, the Preferences "Application core" row
// saves a choice and performs a real navigation with `?core=` stripped, the
// choice survives a reload, a later `?core=` still overrides it, and an
// unknown `?core=` value is ignored in favour of the stored choice.
//
// Runs through `./_context.ts`, whose `test` seeds an authenticated session
// via `context.addInitScript` on every navigation in this test's context
// (including the `?core=` loads below), so no separate sign-in step is
// needed — see login.spec.ts's own doc comment for the one spec that DOES
// need a fresh unauthenticated context.
import * as coreSwitch from "../scenarios/coreSwitch";
import { test } from "./_context";

test.describe("Application core switch", () => {
  test("?core= override, Preferences save + navigate, reload persistence, unknown ?core= ignored", async ({
    ctx,
  }) => {
    // `?core=effect` selects the Effect core for this load only.
    await coreSwitch.openWithCoreImplParam(ctx, "effect");
    await coreSwitch.expectBootedCoreImpl(ctx, "effect", 10_000);

    // Selecting "async" in Preferences saves it and navigates to the same
    // URL with `?core=` stripped — a real page load, not an SPA transition.
    await coreSwitch.openPreferences(ctx);
    await coreSwitch.selectCoreImpl(ctx, "async");
    await coreSwitch.expectUrlHasNoCoreParam(ctx, 10_000);
    await coreSwitch.expectBootedCoreImpl(ctx, "async", 10_000);

    // The stored choice survives a plain reload (no `?core=` present).
    await ctx.po.workspace.reload();
    await coreSwitch.expectBootedCoreImpl(ctx, "async", 10_000);

    // `?core=` still outranks the stored choice.
    await coreSwitch.openWithCoreImplParam(ctx, "rxjs");
    await coreSwitch.expectBootedCoreImpl(ctx, "rxjs", 10_000);

    // An unknown `?core=` value is ignored and falls through to the stored
    // choice ("async", persisted above) — not the build default ("rxjs").
    await coreSwitch.openWithCoreImplParam(ctx, "bogus");
    await coreSwitch.expectBootedCoreImpl(ctx, "async", 10_000);
  });
});
