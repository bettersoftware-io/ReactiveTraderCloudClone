import { fixtures } from "@ui-visual-shared/fixtures";
// Side-effect import: pins the wall clock before anything below renders. This
// module is the single import surface the playwright tier routes through
// (its host imports VisualScenario via "@ui-visual" → solid/index.ts →
// here), so freezing the clock here freezes it identically to the react
// tiers — see freezeClock.ts.
import "@ui-visual-shared/freezeClock";
import { scenarios } from "@ui-visual-shared/scenarios";
import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { ViewModelProvider } from "@rtc/solid-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
import { FxViewProvider } from "#/ui/fx/FxViewProvider";
import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "#/ui/shell/status/LiveMetricsContext";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import { buildFakeViewModel } from "./buildFakeViewModel";
// Register the app's real @fontsource web fonts so goldens render in the app's
// fonts, not the fallback system stack, and pull in the (weight, family) list we
// force-load below. See loadFonts.ts.
import { FONT_LOAD_SPECS } from "./loadFonts";
import { registry } from "./registry";
import { resolveScenarioData } from "./resolveScenarioData";

// Components that paint their own full-height/viewport container and must not
// sit inside the padded inline-block wrapper used for component-level shots.
// The Phase-2 boot/lock/prefs surfaces are fixed-position viewport overlays, so
// they render full-bleed too (their scenarios are captured fullPage). SAME set
// as the react harness (../react/VisualScenario.tsx) — the componentKey
// vocabulary is framework-neutral.
const FULL_BLEED = new Set([
  "App",
  "BootSequence",
  "LockScreen",
  "PreferencesModal",
]);

interface VisualScenarioProps {
  name: string;
}

/** Solid counterpart of the react driver's `VisualScenario`. Same
 * fonts-then-render gate (see the doc comment below), same provider stack,
 * same full-bleed/padded-wrapper split — only the reactive-primitive
 * mechanics differ: a Solid component body runs ONCE, so the font-ready gate
 * is a signal read in JSX (`<Show when={fontsReady()}>`) rather than a
 * conditional early-return recomputed each render. */
export function VisualScenario(props: VisualScenarioProps): JSX.Element {
  // Content-width shots (inline-block wrapper below) measure text by the active
  // font's metrics. If the screenshot is taken before the web fonts finish
  // loading, the fallback font's wider/narrower glyphs change the measured
  // width non-deterministically — a dimension mismatch, unlike AA jitter,
  // cannot be absorbed via maxDiffPixelRatio.
  //
  // `document.fonts.ready` alone is insufficient: an @font-face is only
  // *declared* until a laid-out element uses it, so `ready` resolves
  // immediately in the fallback state whenever no face has been triggered yet,
  // and the real glyphs swap in after the shot. So instead force-trigger every
  // face the app uses via document.fonts.load(), await them all, then await
  // ready — only then render. Every capture is now in the fonts-loaded state
  // regardless of timing; toMatchScreenshot's stability retry waits out the
  // null→content transition. Mirrors react's VisualScenario.tsx exactly.
  const [fontsReady, setFontsReady] = createSignal(false);

  onMount(() => {
    let cancelled = false;

    void Promise.all(
      FONT_LOAD_SPECS.map((spec) => {
        return document.fonts.load(spec);
      }),
    )
      .then(() => {
        return document.fonts.ready;
      })
      .then(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      });

    // Solid's onMount ignores returned functions (unlike react's useEffect);
    // the disposal guard must register via onCleanup.
    onCleanup(() => {
      cancelled = true;
    });
  });

  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: `name` never changes within one scenario's mounted lifetime (a fresh VisualScenario is mounted per test)
  const name = props.name;
  const scenario = scenarios[name];

  if (!scenario) {
    throw new Error(`Unknown visual scenario: ${name}`);
  }

  const data = resolveScenarioData(scenario, fixtures);
  const render = registry[scenario.componentKey];

  if (!render) {
    throw new Error(`Unknown component: ${scenario.componentKey}`);
  }

  // Setup-scope-only condition (derived from `name`, which never changes
  // within one mount — see above), so a plain JS ternary below is correct;
  // unlike `fontsReady()` it needs no `<Show>` reactive wrapper.
  const fullBleed = FULL_BLEED.has(scenario.componentKey);

  // Single `return` (Solid components run once; two `return` statements
  // would fork the render tree at SETUP time rather than reactively, which
  // `eslint-plugin-solid`'s components-return-once rule flags). The full-
  // bleed/padded-wrapper split is a plain ternary inside the JSX instead.
  return (
    <Show when={fontsReady()}>
      <ViewModelProvider viewModel={buildFakeViewModel(data)}>
        {/* Freeze the cosmetic FPS/MEM readouts (PR #231) so status-bar crops
            are deterministic — mirrors react's VisualScenario and the contract
            tier's render harness. */}
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          <ThemeProvider>
            {/* FxBlotter/LiveRatesPanel/CreditBlotter (and any future FX/credit
                panel) read useFxView()/useCreditView() for their tab/filter
                state; every scenario needs the same providers App.tsx supplies
                via WorkspaceEngine — including full-bleed App itself, which
                nests its own (harmless no-op) copies inside. */}
            <FxViewProvider>
              <CreditViewProvider>
                {fullBleed ? (
                  render(scenario.fixtureKey)
                ) : (
                  <div
                    data-testid="scenario-root"
                    style={{
                      // ThemeProvider sets CSS vars on <html>; paint a real backdrop so
                      // component-level shots aren't on default white.
                      "background-color": "var(--bg-primary)",
                      color: "var(--text-primary)",
                      padding: "24px",
                      display: "inline-block",
                    }}
                  >
                    {render(scenario.fixtureKey)}
                  </div>
                )}
              </CreditViewProvider>
            </FxViewProvider>
          </ThemeProvider>
        </LiveMetricsContext.Provider>
      </ViewModelProvider>
    </Show>
  );
}
