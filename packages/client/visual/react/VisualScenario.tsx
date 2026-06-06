import { ThemeProvider } from "../../src/ui/shell/theme/ThemeProvider";
import { HooksProvider } from "../../src/ui/hooks/HooksProvider";
import { scenarios } from "../shared/scenarios";
import { fixtures } from "../shared/fixtures";
import { buildFakeHooks } from "./buildFakeHooks";
import { registry } from "./registry";

export function VisualScenario({ name }: { name: string }) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown visual scenario: ${name}`);
  const data = fixtures[scenario.fixtureKey];
  if (!data) throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  const render = registry[scenario.componentKey];
  if (!render) throw new Error(`Unknown component: ${scenario.componentKey}`);

  return (
    <ThemeProvider>
      <HooksProvider hooks={buildFakeHooks(data)}>
        <div
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
      </HooksProvider>
    </ThemeProvider>
  );
}
