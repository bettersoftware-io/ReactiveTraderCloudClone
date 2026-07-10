import { type ReactElement, useEffect, useState } from "react";

import { ViewModelProvider } from "@rtc/react-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
import { FxViewProvider } from "#/ui/fx/FxViewProvider";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import { fixtures } from "../shared/fixtures";
// Side-effect import: pins the wall clock before anything below renders. This
// module is the single import surface every tier routes through (vitest-
// browser's spec, the plain-Playwright host, and every playwright-ct spec all
// import VisualScenario via "@ui-visual" → react/index.ts → here), so freezing
// the clock here freezes it identically in all three — see freezeClock.ts.
import "../shared/freezeClock";
import { scenarios } from "../shared/scenarios";
import { buildFakeViewModel } from "./buildFakeViewModel";
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
  // ~46-66px between otherwise-identical x86 runs, which a dimension mismatch
  // — unlike AA jitter — cannot absorb via maxDiffPixelRatio). Gate rendering
  // on document.fonts.ready so every capture is taken in the fonts-loaded
  // state; Playwright's toHaveScreenshot stability retry waits out the
  // null→content transition.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
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

  if (!fontsReady) return null;

  if (FULL_BLEED.has(scenario.componentKey)) {
    return (
      <ViewModelProvider viewModel={buildFakeViewModel(data)}>
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
      </ViewModelProvider>
    );
  }

  return (
    <ViewModelProvider viewModel={buildFakeViewModel(data)}>
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
    </ViewModelProvider>
  );
}
