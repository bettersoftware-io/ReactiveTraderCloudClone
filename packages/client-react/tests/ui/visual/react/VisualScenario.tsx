import { HooksProvider } from "../../../../src/ui/hooks/HooksProvider";
import { ThemeProvider } from "../../../../src/ui/shell/theme/ThemeProvider";
import { fixtures } from "../shared/fixtures";
import { scenarios } from "../shared/scenarios";
import { buildFakeHooks } from "./buildFakeHooks";
import { registry } from "./registry";

// Components that paint their own full-height/viewport container and must not
// sit inside the padded inline-block wrapper used for component-level shots.
const FULL_BLEED = new Set(["App"]);

export function VisualScenario({ name }: { name: string }) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown visual scenario: ${name}`);
  const data = fixtures[scenario.fixtureKey];
  if (!data) throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  const render = registry[scenario.componentKey];
  if (!render) throw new Error(`Unknown component: ${scenario.componentKey}`);

  if (FULL_BLEED.has(scenario.componentKey)) {
    return (
      <HooksProvider hooks={buildFakeHooks(data)}>
        <ThemeProvider>{render(scenario.fixtureKey)}</ThemeProvider>
      </HooksProvider>
    );
  }

  return (
    <HooksProvider hooks={buildFakeHooks(data)}>
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
    </HooksProvider>
  );
}
