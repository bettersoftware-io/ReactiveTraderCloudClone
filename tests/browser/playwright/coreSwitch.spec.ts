// tests/browser/playwright/coreSwitch.spec.ts
//
// End-to-end round trip of the application-core switch
// (docs/superpowers/specs/2026-09-27-runtime-core-switch-design.md, and the
// in-place swap of ADR-006 Follow-up 7): `?core=` overrides for one load; a
// Preferences "Application core" choice swaps the core IN PLACE — no
// navigation, no sign-out, Preferences open again on the new core, the
// trade, the layout and the live prices all intact — and saves the choice,
// stripping `?core=` from the URL; the choice survives a reload, a later
// `?core=` still overrides it, and an unknown `?core=` value is ignored in
// favour of the stored choice.
//
// Runs through `./_context.ts`, whose `test` seeds an authenticated session
// via `context.addInitScript` on every navigation in this test's context
// (including the `?core=` loads below), so no separate sign-in step is
// needed — see login.spec.ts's own doc comment for the one spec that DOES
// need a fresh unauthenticated context. A swap is not a navigation, so that
// seed cannot mask a swap that signs the user out.
//
// The three values this journey asserts on (`start`, `stored`, and the later
// `?core=` override) must all differ from THIS RUN's own build default
// (`RTC_CORE_IMPL`, resolved as every e2e entry point resolves it) — the
// async/effect e2e jobs set it to their own core, and a hardcoded "async"
// stored value would be indistinguishable from "that's just the build
// default" in the async job. `pickDistinctCores` derives all three from
// whatever this run's build default actually is.
import { resolveCoreImpl } from "#/scripts/lib/coreImpl.ts";

import { reloadPage } from "../scenarios/common.ts";
import * as coreSwitch from "../scenarios/coreSwitch.ts";
import { test } from "./_context.ts";

test.describe("Application core switch", () => {
  test("?core= override, Preferences swaps in place, reload persistence, unknown ?core= ignored", async ({
    ctx,
  }) => {
    const buildDefault = resolveCoreImpl(process.env);
    const { start, stored } = coreSwitch.pickDistinctCores(buildDefault);

    // `?core=<start>` selects that core for this load only.
    await coreSwitch.openWithCoreImplParam(ctx, start);
    await coreSwitch.expectBootedCoreImpl(ctx, start, 10_000);

    // A trade, a floated blotter and a collapsed panel for the swaps to keep;
    // then the witnesses that no step below navigates or signs out.
    await coreSwitch.prepareDesk(ctx);
    await coreSwitch.armSwapWitnesses(ctx);

    // Selecting the build default in Preferences swaps it in place.
    await coreSwitch.openPreferences(ctx);
    await coreSwitch.selectCoreImpl(ctx, buildDefault);
    await coreSwitch.expectSwappedInPlace(ctx, buildDefault);

    // Preferences opened again on the new core: choose `stored` from there.
    await coreSwitch.selectCoreImpl(ctx, stored);
    await coreSwitch.expectSwappedInPlace(ctx, stored);

    // The stored choice survives a plain reload (no `?core=` present) — and,
    // since `stored !== buildDefault`, this can only be true if the stored
    // choice was actually read back, not the build default. The layout the
    // swaps kept reached storage too.
    await reloadPage(ctx);
    await coreSwitch.expectBootedCoreImpl(ctx, stored, 10_000);
    await coreSwitch.expectDeskSurvivedReload(ctx);

    // `?core=` still outranks the stored choice (using the build default as
    // the override value — it's automatically distinct from `stored`).
    await coreSwitch.openWithCoreImplParam(ctx, buildDefault);
    await coreSwitch.expectBootedCoreImpl(ctx, buildDefault, 10_000);

    // An unknown `?core=` value is ignored and falls through to the stored
    // choice, not the build default (both persisted above, and distinct).
    await coreSwitch.openWithCoreImplParam(ctx, "bogus");
    await coreSwitch.expectBootedCoreImpl(ctx, stored, 10_000);
  });

  // The plan's manual check, pinned: the cover cannot reach a panel popped
  // out into its own window, so the swap has to close that window itself.
  test("a panel popped out into its own window closes on a swap and comes back docked", async ({
    ctx,
  }) => {
    const buildDefault = resolveCoreImpl(process.env);
    const { start } = coreSwitch.pickDistinctCores(buildDefault);

    await coreSwitch.openWithCoreImplParam(ctx, start);
    await coreSwitch.expectBootedCoreImpl(ctx, start, 10_000);

    await coreSwitch.poppedOutPanelClosesOnSwapAndComesBackDocked(
      ctx,
      buildDefault,
    );
  });
});
