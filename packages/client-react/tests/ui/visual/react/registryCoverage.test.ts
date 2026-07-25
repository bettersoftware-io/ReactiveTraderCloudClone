import { scenarios } from "@ui-visual-shared/scenarios";
import { describe, expect, it } from "vitest";

import { registry } from "./registry";

// Referential-integrity coverage for the componentKey half of every
// registered scenario (packages/ui-contract/src/visual/scenarios.test.ts
// covers the fixtureKey half from within @rtc/ui-contract itself). The
// registry is framework-specific and lives here, not in @rtc/ui-contract —
// ui-contract is a leaf both clients depend on, so it cannot import this
// package's registry.tsx without inverting the dependency graph. Splitting
// the check across packages this way still guards the WHOLE registered set:
// a typo'd componentKey currently only surfaces as a runtime
// "Unknown component" throw (VisualScenario.tsx) the first time that
// scenario is actually rendered by a visual tier, rather than failing this
// fast unit test.
describe("visual registry coverage (React)", () => {
  it("every scenario's componentKey resolves to a registered component", () => {
    for (const [name, scenario] of Object.entries(scenarios)) {
      expect(
        registry[scenario.componentKey],
        `scenario "${name}" points at unknown componentKey "${scenario.componentKey}"`,
      ).toBeDefined();
    }
  });
});
