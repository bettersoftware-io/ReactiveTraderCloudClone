import { describe, expect, it } from "vitest";

import { flowYaml } from "./generateFlows";
import { SCENARIO_IDS } from "../scenarioIds";

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
