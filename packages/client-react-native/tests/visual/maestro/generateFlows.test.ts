import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCENARIO_IDS } from "../scenarioIds";
import { flowYaml } from "./generateFlows";

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

  it("stops the app before the dev-client link, so every flow cold-launches", () => {
    const commands = commandLines(flowYaml("blotter/seeded"));

    // The FIRST command of the launch, ahead of the link: a running app
    // reloads its bundle on that link and crashes under Maestro's next
    // accessibility query.
    expect(commands[1]).toBe("- stopApp");
    expect(commands[2]).toBe("- openLink:");
  });

  // On Android the app now and then dies at launch (a native crash while the
  // dev client recreates the activity), and nothing relaunches it. The retry
  // has to hold the stop, the link and the wait together: retrying the wait
  // alone would wait again on a dead app.
  it("retries the whole launch once, from the stop to the login screen", () => {
    const lines = flowYaml("blotter/seeded").split("\n");
    const retry = lines.indexOf("- retry:");
    const afterRetry = lines.findIndex((line, index) => {
      return index > retry && line.startsWith("- ");
    });
    const retried = lines.slice(retry, afterRetry).join("\n");

    expect(commandLines(flowYaml("blotter/seeded"))[0]).toBe("- retry:");
    expect(retried).toContain("    maxRetries: 1");
    expect(retried).toContain("      - stopApp");
    expect(retried).toContain("expo-development-client");
    expect(retried).toContain('            id: "login-screen"');
    // The scenario link and the shot come after it, once.
    expect(retried).not.toContain("rtcmobile://__visual/");
    expect(retried).not.toContain("takeScreenshot");
  });

  // One flow set drives both platforms. Android opens a link without asking,
  // and an app screen there may carry its own "Open" text for this to tap.
  it("taps the 'Open' confirmation on iOS only", () => {
    const lines = flowYaml("blotter/seeded")
      .split("\n")
      .map((line) => {
        return line.trim();
      });

    const conditions = lines.filter((line) => {
      return line === 'visible: "Open"';
    });

    expect(conditions).toHaveLength(2);

    for (const [index, line] of lines.entries()) {
      if (line === 'visible: "Open"') {
        expect(lines[index - 1]).toBe("platform: iOS");
      }
    }
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
 *     node tests/visual/maestro/generateFlows.ts
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

/** Every command of a flow in order, nested ones included, unindented. */
function commandLines(yaml: string): string[] {
  return yaml
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return line.startsWith("- ");
    });
}

function flowFileName(scenarioId: string): string {
  return `${scenarioId.replace(/\//g, "_")}.yaml`;
}

const FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), "flows");
