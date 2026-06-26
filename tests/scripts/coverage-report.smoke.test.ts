import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { main, TIERS } from "./coverage-report";

describe("coverage-report CLI", () => {
  it("exposes a tier manifest covering domain, server, and the three client tiers", () => {
    expect(TIERS.coverage.map((t) => t.name)).toEqual([
      "domain",
      "server",
      "client/app",
      "client/ui",
    ]);
    // client/ui unions contract + visual.
    const ui = TIERS.coverage.find((t) => t.name === "client/ui");
    expect(ui?.paths.length).toBe(2);
  });

  it("renders a report from fixtures without throwing", async () => {
    const repoRoot = fileURLToPath(
      new URL("./lib/__fixtures__/", import.meta.url),
    );
    // Point the manifest at fixtures via env override (see implementation).
    const md = await main({
      repoRoot: "/r",
      coverageOverride: [
        { name: "domain", files: [`${repoRoot}domain.coverage.json`] },
      ],
      resultsOverride: [
        { tier: "domain", file: `${repoRoot}domain.results.json` },
      ],
    });
    expect(md).toContain("## Coverage");
    expect(md).toContain("3 passed");
    expect(md).toContain("packages/domain/src/sample.ts");
  });
});
