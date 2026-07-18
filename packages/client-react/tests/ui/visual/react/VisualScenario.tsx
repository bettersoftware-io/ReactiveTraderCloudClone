import { fixtures } from "@ui-visual-shared/fixtures";
// Side-effect import: pins the wall clock before anything below renders. This
// module is the single import surface every tier routes through (vitest-
// browser's spec, the plain-Playwright host, and every playwright-ct spec all
// import VisualScenario via "@ui-visual" → react/index.ts → here), so freezing
// the clock here freezes it identically in all three — see freezeClock.ts.
import "@ui-visual-shared/freezeClock";
import { scenarios } from "@ui-visual-shared/scenarios";
import { type ReactElement, useEffect, useState } from "react";

import { ViewModelProvider } from "@rtc/react-bindings";

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
// they render full-bleed too (their scenarios are captured fullPage).
const FULL_BLEED = new Set([
  "App",
  "BootSequence",
  "LockScreen",
  "PreferencesModal",
]);

interface VisualScenarioProps {
  name: string;
}

export function VisualScenario({
  name,
}: VisualScenarioProps): ReactElement | null {
  // Content-width shots (inline-block wrapper below) measure text by the active
  // font's metrics. If the screenshot is taken before the web fonts finish
  // loading, the fallback font's wider/narrower glyphs change the measured
  // width non-deterministically (observed: fx-blotter scenarios drifting
  // ~46-66px, and chrome-header measured 1139px fallback vs 1180px real,
  // between otherwise-identical x86 runs — a dimension mismatch, unlike AA
  // jitter, cannot be absorbed via maxDiffPixelRatio).
  //
  // `document.fonts.ready` alone is insufficient: an @font-face is only
  // *declared* until a laid-out element uses it, so `ready` resolves
  // immediately in the fallback state whenever no face has been triggered yet,
  // and the real glyphs swap in after the shot. Whether a face happens to be
  // triggered in time is pure run-timing luck (a heavier neighbouring scenario
  // was enough to tip chrome-header from fallback to real). So instead
  // force-trigger every face the app uses via document.fonts.load(), await
  // them all, then await ready — only then render. Every capture is now in the
  // fonts-loaded state regardless of timing; toHaveScreenshot's stability
  // retry waits out the null→content transition.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
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

    return () => {
      cancelled = true;
    };
  }, []);

  const scenario = scenarios[name];

  if (!scenario) {
    throw new Error(`Unknown visual scenario: ${name}`);
  }

  const data = resolveScenarioData(scenario, fixtures);
  const render = registry[scenario.componentKey];

  if (!render) {
    throw new Error(`Unknown component: ${scenario.componentKey}`);
  }

  if (!fontsReady) {
    return null;
  }

  if (FULL_BLEED.has(scenario.componentKey)) {
    return (
      <ViewModelProvider viewModel={buildFakeViewModel(data)}>
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          <ThemeProvider>
            {/* App.tsx nests its own Fx/CreditViewProviders inside
                WorkspaceEngine; these outer ones are harmless no-ops for that
                path and cover every other full-bleed component that might read
                useFxView/useCreditView. */}
            <FxViewProvider>
              <CreditViewProvider>
                {render(scenario.fixtureKey)}
              </CreditViewProvider>
            </FxViewProvider>
          </ThemeProvider>
        </LiveMetricsContext.Provider>
      </ViewModelProvider>
    );
  }

  return (
    <ViewModelProvider viewModel={buildFakeViewModel(data)}>
      <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
        <ThemeProvider>
          {/* FxBlotter/LiveRatesPanel/CreditBlotter (and any future FX/credit
              panel) read useFxView()/useCreditView() for their tab/filter
              state; standalone component-level shots need the same providers
              App.tsx supplies via WorkspaceEngine. */}
          <FxViewProvider>
            <CreditViewProvider>
              <div
                data-testid="scenario-root"
                style={{
                  // ThemeProvider sets CSS vars on <html>; paint a real backdrop so
                  // component-level shots aren't on default white.
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  padding: 24,
                  display: "inline-block",
                }}
              >
                {render(scenario.fixtureKey)}
              </div>
            </CreditViewProvider>
          </FxViewProvider>
        </ThemeProvider>
      </LiveMetricsContext.Provider>
    </ViewModelProvider>
  );
}
