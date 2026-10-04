import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { buildHomeMap } from "./homeMap.ts";

describe("buildHomeMap", () => {
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("follows a named re-export to the package and module that declare the name", () => {
    expect(homes.makeThing).toEqual({
      pkg: "beta",
      module: "thing.ts",
      name: "makeThing",
      isValue: true,
    });
  });

  it("tells a type from a value", () => {
    expect(homes.Thing).toEqual({
      pkg: "beta",
      module: "thing.ts",
      name: "Thing",
      isValue: false,
    });
  });

  it("follows `export *` through a subpath import", () => {
    expect(homes.OTHER).toEqual({
      pkg: "beta",
      module: "other.ts",
      name: "OTHER",
      isValue: true,
    });
  });

  it("resolves the package's own `#/` alias to its own src", () => {
    expect(homes.own).toEqual({
      pkg: "alpha",
      module: "nested/own.ts",
      name: "own",
      isValue: true,
    });
  });

  it("keeps the declared name of a renamed re-export", () => {
    expect(homes.buildThing).toEqual({
      pkg: "beta",
      module: "thing.ts",
      name: "makeThing",
      isValue: true,
    });
  });

  it("gives a name declared outside every package's src no package", () => {
    expect(homes.outside).toMatchObject({ pkg: "", isValue: true });
  });

  it("gives a name whose module does not resolve no package", () => {
    expect(homes.missing).toMatchObject({ pkg: "" });
  });

  it("lists every export of the entry and nothing else", () => {
    expect(Object.keys(homes).sort()).toEqual([
      "OTHER",
      "Thing",
      "buildThing",
      "makeThing",
      "missing",
      "outside",
      "own",
    ]);
  });

  const repo = createFixtureRepo();

  const homes = buildHomeMap(join(repo, "packages/alpha/src/index.ts"), repo);
});

/** A two-package repo in a temp directory: `alpha`'s entry re-exports from
 * `beta` (named, type-only, `export *` of a subpath), from its own `#/`
 * alias, from a file outside any package, and from a module that does not
 * exist. Built at run time so no gate ever reads it as repo source. */
function createFixtureRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "home-map-")));
  const files: Record<string, string> = {
    "tsconfig.depcruise.json": JSON.stringify(createFixtureTsconfig()),
    "outside.ts": "export const outside = 3;\n",
    "packages/alpha/src/index.ts": [
      'export type { Thing } from "@fx/beta";',
      'export { makeThing, makeThing as buildThing } from "@fx/beta";',
      'export * from "@fx/beta/other";',
      'export * from "#/nested/own";',
      'export { outside } from "../../../outside";',
      'export { missing } from "@fx/nowhere";',
      "",
    ].join("\n"),
    "packages/alpha/src/nested/own.ts": "export const own = 1;\n",
    "packages/beta/src/index.ts": 'export * from "./thing";\n',
    "packages/beta/src/thing.ts": [
      "export interface Thing {",
      "  id: string;",
      "}",
      "",
      "export function makeThing(): Thing {",
      '  return { id: "a" };',
      "}",
      "",
    ].join("\n"),
    "packages/beta/src/other.ts": "export const OTHER = 2;\n",
  };

  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), text);
  }

  return repo;
}

function createFixtureTsconfig(): object {
  return {
    compilerOptions: {
      baseUrl: ".",
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      types: [],
      paths: {
        "@fx/beta": ["packages/beta/src/index.ts"],
        "@fx/beta/*": ["packages/beta/src/*"],
      },
    },
  };
}
