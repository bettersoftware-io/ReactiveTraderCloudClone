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
//
// The three values this journey asserts on (`start`, `stored`, and the later
// `?core=` override) must all differ from THIS RUN's own build default
// (`RTC_CORE_IMPL`, same source as login.ts's `expectSelectedCoreImpl`) — the
// async/effect e2e jobs set it to their own core, and a hardcoded "async"
// stored value would be indistinguishable from "that's just the build
// default" in the async job. `pickDistinctCores` derives all three from
// whatever this run's build default actually is.
import * as coreSwitch from "../scenarios/coreSwitch";
import { test } from "./_context";

test.describe("Application core switch", () => {
  test("?core= override, Preferences save + navigate, reload persistence, unknown ?core= ignored", async ({
    ctx,
  }) => {
    const buildDefault = process.env.RTC_CORE_IMPL || "rxjs";
    const { start, stored } = coreSwitch.pickDistinctCores(buildDefault);

    // `?core=<start>` selects that core for this load only.
    await coreSwitch.openWithCoreImplParam(ctx, start);
    await coreSwitch.expectBootedCoreImpl(ctx, start, 10_000);

    // Selecting `stored` in Preferences saves it and navigates to the same
    // URL with `?core=` stripped — a real page load, not an SPA transition.
    await coreSwitch.openPreferences(ctx);
    await coreSwitch.selectCoreImpl(ctx, stored);
    await coreSwitch.expectUrlHasNoCoreParam(ctx, 10_000);
    await coreSwitch.expectBootedCoreImpl(ctx, stored, 10_000);

    // The stored choice survives a plain reload (no `?core=` present) — and,
    // since `stored !== buildDefault`, this can only be true if the stored
    // choice was actually read back, not the build default.
    await ctx.po.workspace.reload();
    await coreSwitch.expectBootedCoreImpl(ctx, stored, 10_000);

    // `?core=` still outranks the stored choice (using the build default as
    // the override value — it's automatically distinct from `stored`).
    await coreSwitch.openWithCoreImplParam(ctx, buildDefault);
    await coreSwitch.expectBootedCoreImpl(ctx, buildDefault, 10_000);

    // An unknown `?core=` value is ignored and falls through to the stored
    // choice, not the build default (both persisted above, and distinct).
    await coreSwitch.openWithCoreImplParam(ctx, "bogus");
    await coreSwitch.expectBootedCoreImpl(ctx, stored, 10_000);
  });
});
