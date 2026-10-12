import { describe, expect, it } from "vitest";

import { failedFlowLines, noShotLine } from "./maestroOutcome";

describe("failedFlowLines", () => {
  it("returns the failed flows of a rejected run, in run order", () => {
    const error = Object.assign(new Error("Command failed: maestro"), {
      code: 1,
      stdout: createSuiteOutput(),
    });

    expect(failedFlowLines(error)).toStrictEqual([
      "[Failed] boot_docking (2m 3s) (Assertion is false: id: login-screen is visible)",
      "[Failed] boot_core (2m 2s) (Assertion is false: id: login-screen is visible)",
    ]);
  });

  it("returns nothing when every flow passed", () => {
    const error = Object.assign(new Error("Command failed: maestro"), {
      stdout: "[Passed] equities_trade (8s)\n",
    });

    expect(failedFlowLines(error)).toStrictEqual([]);
  });

  // The runner rethrows on an empty list, so a failure that names no flow must
  // never be read as "no flow failed".
  it("returns nothing for a failure that carries no Maestro output", () => {
    expect(failedFlowLines(new Error("spawn maestro ENOENT"))).toStrictEqual(
      [],
    );
    expect(failedFlowLines({ stdout: undefined })).toStrictEqual([]);
    expect(failedFlowLines("boom")).toStrictEqual([]);
    expect(failedFlowLines(null)).toStrictEqual([]);
  });
});

describe("noShotLine", () => {
  it("names the scenario and says no pixels were compared", () => {
    const line = noShotLine("equities/trade");

    expect(line).toContain("equities/trade");
    expect(line.startsWith("NO SHOT")).toBe(true);
    expect(line.startsWith("FAIL")).toBe(false);
  });
});

function createSuiteOutput(): string {
  return [
    "",
    "Waiting for flows to complete...",
    "[Failed] boot_docking (2m 3s) (Assertion is false: id: login-screen is visible)",
    "[Passed] equities_markets (8s)",
    "  [Failed] boot_core (2m 2s) (Assertion is false: id: login-screen is visible)",
    "[Passed] rates_ticket (6s)",
    "",
    "2/26 Flows Failed",
    "",
  ].join("\n");
}
