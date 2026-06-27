import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { main, TIERS } from "./coverage-report";

describe("coverage-report CLI", () => {
  it("exposes the five standalone coverage tiers", () => {
    expect(
      TIERS.coverage.map((t) => {
        return t.name;
      }),
    ).toEqual([
      "domain",
      "server",
      "client/app",
      "client/ui (contract)",
      "client/ui (visual)",
    ]);

    // Each tier reads exactly one coverage-final.json (no union).
    for (const t of TIERS.coverage) {
      expect(typeof t.path).toBe("string");
    }
  });

  it("renders a report from fixtures without throwing", async () => {
    const dir = fileURLToPath(new URL("./lib/__fixtures__/", import.meta.url));
    const md = await main({
      repoRoot: "/r",
      coverageOverride: [
        { name: "domain", file: `${dir}domain.coverage.json` },
      ],
      resultsOverride: [{ tier: "domain", file: `${dir}domain.results.json` }],
      readSource: () => {
        return ["const sample = 1", "function unused(): void {}"];
      },
    });
    expect(md).toContain("## Coverage");
    expect(md).toContain("3 passed");
    expect(md).toContain("packages/domain/src/sample.ts");
    expect(md).toContain("```diff");
  });
});
