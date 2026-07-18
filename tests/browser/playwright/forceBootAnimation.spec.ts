// tests/browser/playwright/forceBootAnimation.spec.ts
//
// Real-browser proof of the forceBootAnimation preference: with
// prefers-reduced-motion emulated, the preference forces the boot canvas to
// keep rendering instead of the reduced-motion CSS hiding it (Task 4 already
// proved the JS gate in jsdom via rAF-spy tests — this is the DOM/CSS
// witness). Drives `/?splash`, the force-on override added to
// bootSplashGate.ts alongside this spec, so the splash actually mounts even
// though Playwright sets `navigator.webdriver` (which otherwise suppresses
// it for every other spec in this suite).
//
// Runs pre-auth: BootGate is mounted OUTSIDE AuthGate (see AppRoot.tsx), so
// this passes identically on react and solid without touching the divergent
// login flow — no `withWorkspaceOpen`/login step needed.
//
// All assertions delegate to scenario helpers — gates 9-11 compliant (no raw
// driver handles or page-object access in this file).
import * as boot from "../scenarios/boot";
import { test } from "./_context";

test.describe("force boot animation (reduced motion)", () => {
  // `reducedMotion` is a BrowserContextOptions field, not a top-level test
  // option (unlike `colorScheme`/`viewport`) — it must be nested under
  // `contextOptions` for `test.use()` to thread it into `browser.newContext()`.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("pref ON: the boot canvas renders even under reduced motion", async ({
    ctx,
  }) => {
    await boot.openBoot(ctx, { forceAnimation: true });
    await boot.expectForceAnimAttr(ctx, "true");
    await boot.expectCanvasVisible(ctx);
  });

  test("pref OFF: the boot canvas stays hidden under reduced motion", async ({
    ctx,
  }) => {
    await boot.openBoot(ctx);
    await boot.expectForceAnimAttr(ctx, "false");
    // Real element present (asserted just above), but the reduced-motion CSS
    // hides the canvas — not a removed element.
    await boot.expectCanvasHidden(ctx);
  });
});
