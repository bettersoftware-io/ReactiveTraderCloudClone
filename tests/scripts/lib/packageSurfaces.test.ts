import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildHomeMap } from "./homeMap.ts";

/** An implementation package exports what it declares and nothing else: a
 * name another package declares is imported from that package, never
 * through a pass-through "so existing imports keep working". The checker
 * follows every re-export, so a type-only pass-through is caught too.
 * What it cannot see is a NEW declaration that merely copies a foreign value
 * (`export const X = DOMAIN_X`): that is this package's name to the checker.
 * The pinned surfaces (`publicApi.test.ts`, `core.publicApi.test.ts`) are
 * where one of those shows up, as a new name in the snapshot. */
describe("package entry points export only names the package declares", () => {
  it.each(createEntries())("$pkg ($entry)", ({ pkg, entry }) => {
    const homes = buildHomeMap(resolve(REPO, "packages", pkg, entry), REPO);
    const foreign = Object.entries(homes)
      .filter(([, home]) => {
        return home.pkg !== pkg;
      })
      .map(([name, home]) => {
        return `${name} (declared in ${home.pkg})`;
      });

    // Positive witness: the map is not empty, so `foreign` being empty
    // means something.
    expect(Object.keys(homes).length).toBeGreaterThan(0);
    expect(foreign).toEqual([]);
  });
});

const REPO = resolve(import.meta.dirname, "../../..");

interface Entry {
  pkg: string;
  entry: string;
}

/** Every entry point of an implementation package: the three application
 * cores, the adapters and the rules the cores share. A function, not a
 * constant, because `it.each` reads it while the cases are being collected. */
function createEntries(): readonly Entry[] {
  return [
    { pkg: "client-core", entry: "src/index.ts" },
    { pkg: "client-core", entry: "src/testing.ts" },
    { pkg: "client-core-rxjs", entry: "src/index.ts" },
    { pkg: "client-core-async", entry: "src/index.ts" },
    { pkg: "client-core-effect", entry: "src/index.ts" },
    { pkg: "core-logic", entry: "src/index.ts" },
  ];
}
