import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildHomeMap } from "./homeMap.ts";

/** An implementation package exports what it declares and nothing else: a
 * name another package declares is imported from that package, never
 * through a pass-through "so existing imports keep working". The checker
 * follows every re-export, so a type-only pass-through is caught too.
 * What it cannot see is a NEW declaration that merely copies a foreign value
 * (`export const X = DOMAIN_X`): that is this package's name to the checker.
 * The pinned surfaces (each package's `publicApi.test.ts` snapshot) are
 * where one of those shows up, as a new name in the snapshot. */
describe("package entry points export only names the package declares", () => {
  it.each(createEntries())(
    "$pkg ($entry)",
    ({ pkg, entry }) => {
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
    },
    TYPE_CHECKER_TIMEOUT_MS,
  );
});

/** The contract and the UI side speak the domain's vocabulary, never the
 * wire's. dependency-cruiser sees only value edges, so a type-only import of
 * `@rtc/shared` would pass it; what stops one is that these packages do not
 * list `@rtc/shared`, which leaves the typecheck unable to resolve it. This
 * pins the manifests, so the edge cannot come back by adding a dependency. */
describe("the contract and the UI side do not depend on the wire package", () => {
  it.each(createWireFreePackages())("%s", (pkg) => {
    const manifest: Manifest = JSON.parse(
      readFileSync(resolve(REPO, "packages", pkg, "package.json"), "utf8"),
    );

    const listed = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };

    // Positive witness: the manifest was read and lists workspace packages.
    expect(Object.keys(listed)).toContain("@rtc/domain");
    expect(Object.keys(listed)).not.toContain("@rtc/shared");
  });
});

/** Each case builds a TypeScript program over a package's whole source: about
 * half a second on an idle machine, several on a loaded CI runner. This is
 * CPU work, not a wait, so the budget is simply generous. */
const TYPE_CHECKER_TIMEOUT_MS = 60_000;

const REPO = resolve(import.meta.dirname, "../../..");

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface Entry {
  pkg: string;
  entry: string;
}

/** Every entry point of an implementation package: the three application
 * cores, the adapters, the rules the cores share and the wire package. A
 * function, not a constant, because `it.each` reads it while the cases are
 * being collected. */
function createEntries(): readonly Entry[] {
  return [
    { pkg: "client-adapters", entry: "src/index.ts" },
    { pkg: "client-adapters", entry: "src/testing.ts" },
    { pkg: "client-core-rxjs", entry: "src/index.ts" },
    { pkg: "client-core-async", entry: "src/index.ts" },
    { pkg: "client-core-effect", entry: "src/index.ts" },
    { pkg: "core-logic", entry: "src/index.ts" },
    { pkg: "shared", entry: "src/index.ts" },
  ];
}

/** `@rtc/core-api`, and every package on the UI's side of it. */
function createWireFreePackages(): readonly string[] {
  return [
    "core-api",
    "react-bindings",
    "solid-bindings",
    "client-react",
    "client-solid",
    "client-react-native",
    "ui-contract",
  ];
}
