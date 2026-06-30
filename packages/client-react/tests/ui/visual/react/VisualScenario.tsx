import { type ReactElement, useEffect, useState } from "react";

import { ViewModelProvider } from "#/ui/hooks/ViewModelProvider";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import { fixtures } from "../shared/fixtures";
import { scenarios } from "../shared/scenarios";
import { buildFakeHooks } from "./buildFakeHooks";
import { registry } from "./registry";

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
  if (!scenario) throw new Error(`Unknown visual scenario: ${name}`);
  const data = fixtures[scenario.fixtureKey];
  if (!data) throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  const render = registry[scenario.componentKey];
  if (!render) throw new Error(`Unknown component: ${scenario.componentKey}`);

  if (!fontsReady) return null;

  if (FULL_BLEED.has(scenario.componentKey)) {
    return (
      <ViewModelProvider viewModel={buildFakeHooks(data)}>
        <ThemeProvider>{render(scenario.fixtureKey)}</ThemeProvider>
      </ViewModelProvider>
    );
  }

  return (
    <ViewModelProvider viewModel={buildFakeHooks(data)}>
      <ThemeProvider>
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
      </ThemeProvider>
    </ViewModelProvider>
  );
}
