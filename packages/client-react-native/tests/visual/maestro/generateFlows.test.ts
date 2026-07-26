import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCENARIO_IDS } from "../scenarioIds";
import { flowYaml } from "./generateFlows";

const FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), "flows");

describe("flowYaml", () => {
  it("emits a two-step dev-client flow that screenshots the scenario", () => {
    const yaml = flowYaml("blotter/seeded");
    // appId is the dev client / app bundle
    expect(yaml).toContain("appId: io.bettersoftware.rtcmobile");
    // step 1: load the Metro bundle via the dev-client scheme
    expect(yaml).toContain("exp+rtc-mobile://expo-development-client/?url=");
    // step 2: in-app scenario deep link (release scheme)
    expect(yaml).toContain("rtcmobile://__visual/blotter/seeded");
    // waits for the harness ready marker (Maestro CAN query a11y — bake-off point)
    expect(yaml).toContain("visual-ready");
    // screenshots to a flattened (slash-free) name
    expect(yaml).toContain("takeScreenshot: shots/blotter_seeded");
  });

  it("flattens slashes in the screenshot name for every registered id", () => {
    for (const id of SCENARIO_IDS) {
      const yaml = flowYaml(id);
      expect(yaml).toContain(`takeScreenshot: shots/${id.replace(/\//g, "_")}`);
    }
  });
});

/**
 * The committed `flows/` tree is a GENERATED artifact checked in beside its
 * generator, and nothing tied the two together: the suite above only exercises
 * the pure `flowYaml()` function, so `flows/` silently drifted to 3 files while
 * `SCENARIO_IDS` grew to 8 (rn-open-items T9). `maestro/run.ts` iterates all 8,
 * so the tier could not complete a run — and no test noticed, because no test
 * ever looked at the directory.
 *
 * These two assertions close that. The first catches a scenario added without
 * regenerating; the second catches `flowYaml()` changing without regenerating,
 * which the first cannot see. Both are fixed the same way:
 *
 *     pnpm exec tsx tests/visual/maestro/generateFlows.ts
 *
 * NOTE what this deliberately does NOT assert: that a golden exists for each
 * flow. Goldens can only be produced by a Mac-local `:update` pass against a
 * booted simulator, followed by a human eyeballing each PNG — the harness README
 * is explicit that `:update` in a bad state will happily pin a screenshot of the
 * Expo launcher as the baseline. A CI-enforceable "golden exists" check would
 * therefore be a gate nobody could satisfy from CI, so the golden gap stays
 * tracked in T9 rather than encoded here as a permanently-red test.
 */
describe("committed flows", () => {
  it("has exactly one flow per registered scenario id", () => {
    const committed = readdirSync(FLOWS_DIR)
      .filter((f) => {
        return f.endsWith(".yaml");
      })
      .sort();

    expect(committed).toStrictEqual(SCENARIO_IDS.map(flowFileName).sort());
  });

  it("matches byte-for-byte what the generator emits today", () => {
    for (const id of SCENARIO_IDS) {
      const committed = readFileSync(join(FLOWS_DIR, flowFileName(id)), "utf8");

      expect(committed).toBe(flowYaml(id));
    }
  });
});

function flowFileName(scenarioId: string): string {
  return `${scenarioId.replace(/\//g, "_")}.yaml`;
}
