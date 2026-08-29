import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { main, TIERS } from "./coverage-report";

describe("coverage-report CLI", () => {
  it("exposes the ten standalone coverage tiers, both clients framework-prefixed and symmetric", () => {
    expect(
      TIERS.coverage.map((t) => {
        return t.name;
      }),
    ).toEqual([
      "domain",
      "server",
      "devtools/core",
      "devtools/app",
      "react/app",
      "react/ui (contract)",
      "react/ui (visual reach)",
      "solid/app",
      "solid/ui (contract)",
      "solid/ui (visual reach)",
    ]);

    // Both clients must be represented: a react-only report is what let
    // client-solid's buildBrowserPorts sit at 50% unnoticed.
    for (const client of ["react", "solid"]) {
      expect(
        TIERS.coverage.some((t) => {
          return t.name.startsWith(`${client}/`);
        }),
      ).toBe(true);
    }

    // ...and represented IDENTICALLY. Being merely "present" is what the
    // previous version asserted, and solid passed it while missing the
    // visual-reach tier entirely — a whole instrument absent on one side, which
    // reads in the report as "no such gap" rather than "never measured".
    expect(clientTiers("solid")).toEqual(clientTiers("react"));

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

/** The tier suffixes registered for one client, e.g. ["app", "ui (contract)",
 * "ui (visual reach)"] — so the two clients can be compared for symmetry. */
function clientTiers(client: string): string[] {
  return TIERS.coverage
    .filter((t) => {
      return t.name.startsWith(`${client}/`);
    })
    .map((t) => {
      return t.name.slice(client.length + 1);
    })
    .sort();
}
