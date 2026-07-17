import { expect, test } from "@playwright/test";
import { goldenPathArray } from "@ui-visual-shared/goldenPath";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";

// FALLBACK Tier 1 — see ../playwright-ct.config.ts's header comment for the
// full "why not the real CT adapter" rationale. This spec is deliberately
// named `matrix.spec.tsx` (not `visual.spec.ts`, contrary to how similar the
// body is to ../playwright/visual.spec.ts) so `snapshotPathTemplate`'s
// `{testFileName}` resolves to the SAME path segment react's real CT spec
// produces — the golden tree layout is the porting contract here, not the
// file's own contents (which contain no JSX and could just as well be
// `.ts` — the `.tsx` extension exists purely to match the filename).
//
// Behaviourally this is URL-navigation, structurally identical to
// ../playwright/visual.spec.ts — the only things that differ tier-to-tier are
// the config's golden routing (react's playwright-ct/__screenshots__/) and
// the host's page-level reset (./host/main.tsx's minimal reset, matching
// react's own CT host instead of the fuller app-equivalent reset in
// ../playwright/host/main.tsx).
//
// INTENTIONAL OMISSION: react's Tier 1 (../../../../../client-react/tests/ui/
// visual/playwright-ct/matrix.spec.tsx:12-21) has a `test.beforeEach` that
// clears `window.localStorage` and stubs the `**/throughput` route. This
// fallback has neither: it mirrors Tier 2's URL-navigation body (../playwright/
// visual.spec.ts), where state is seeded entirely through per-fixture seam data
// (data.themeMode / data.viewMode, see below), never localStorage — and
// throughput here is fixture-fed via the scenario/action matrix, not fetched
// over the network, so there is no route to stub.

// CI-only known-diffs: the classic skin is the only skin whose font tokens
// resolve to OS-generic keywords (system-ui / ui-monospace) instead of embedded
// @fontsource faces, so classic CT element-crops encode the RUNNER's font
// environment, not the UI. React's CI (x86) CT goldens for these four capture a
// GitHub-hosted-runner-specific system-font resolution (header 1218px wide)
// that no other environment reproduces: this host, react's own CT harness in a
// fresh pinned-image container (arm64 AND amd64), and react's other two x86
// tiers all agree on the narrower render (1177px). Both scenarios remain
// pixel-verified on x86 by the playwright + vitest-browser tiers and by all
// three tiers on darwin (where this skip does not apply). Root-cause evidence:
// SolidJS-port Phase 4 (PR #230) ct-font-rootcause report. The robust fix —
// backing classic's OS-native font tokens with a deterministic embedded face —
// is a design decision tracked in docs/STATUS.md.
const CI_HOST_FONT_SENSITIVE = new Set([
  "chrome/header__classic-dark",
  "chrome/header__classic-light",
  "admin/event-log__classic-dark",
  "admin/event-log__classic-light",
]);

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async ({ page }) => {
    test.skip(
      Boolean(process.env.CI) && CI_HOST_FONT_SENSITIVE.has(name),
      "classic-skin CT crop is host-font-environment-sensitive on CI (see header comment)",
    );
    // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.

    // The boot sequence reads prefers-reduced-motion to skip its rAF canvas loop;
    // emulate it BEFORE navigating so only the deterministic chrome is rendered.
    if (action.reducedMotion) {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    await page.goto(`/?scenario=${encodeURIComponent(name)}`);

    if (action.click) {
      await page.getByTestId(action.click).click();
    }

    for (const step of action.steps ?? []) {
      if ("click" in step) {
        await page.getByTestId(step.click).click();
      } else if ("type" in step) {
        await page.getByTestId(step.type).fill(step.text);
      } else {
        await page.getByTestId(step.select).selectOption(step.value);
      }
    }

    if (action.waitForText) {
      await expect(page.getByText(action.waitForText)).toBeVisible();
    }

    if (action.assertAriaLabelOf !== undefined) {
      await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
        "aria-label",
        action.expectAriaLabel,
      );
    }

    const shot = goldenPathArray(name, scenario);

    if (action.fullPage) {
      await expect(page).toHaveScreenshot(shot, {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
        animations: "disabled",
      });
    }
  });
}
