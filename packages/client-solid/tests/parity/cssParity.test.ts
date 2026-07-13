import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";

import { describe, expect, it } from "vitest";

// Flip to true once every `client-react` `src/ui/**/*.module.css` has a
// ported Solid twin (end of Phase 3 — Task 16 flips this). Until then the
// gate only enforces byte equality on the OVERLAPPING subset (files that
// exist on both sides); once flipped it additionally asserts the file SETS
// are identical, so a component landing in client-react's src/ui without a
// Solid counterpart (or vice versa) fails the build.
const PARITY_COMPLETE = false;

// Both roots resolved from this file's own location (not cwd) so the test
// works regardless of the invoking directory. This is a test file — reading
// across the package boundary into a sibling package's source tree is fine
// (the CLAUDE.md dependency rule governs runtime imports, not test-time
// filesystem reads that enforce a porting contract between two apps).
//
// `URL` is imported explicitly from `node:url` (not the ambient global):
// this suite's `environment: "jsdom"` (vitest.config.ts) replaces the
// global `URL` with jsdom's own, which resolves a relative `new URL(rel,
// base)` against jsdom's `http://localhost:3000` document base instead of
// treating `base` (a real `file:` URL) as the resolution root — silently
// producing an `http://localhost:3000/...` URL instead of throwing, so the
// bug is easy to miss without an explicit import.
const solidUiRoot = fileURLToPath(new NodeURL("../../src/ui", import.meta.url));
const reactUiRoot = fileURLToPath(
  new NodeURL("../../../client-react/src/ui", import.meta.url),
);

const reactRelPaths = findModuleCssFiles(reactUiRoot);
const solidRelPaths = findModuleCssFiles(solidUiRoot);
const solidRelPathSet = new Set(solidRelPaths);
const reactRelPathSet = new Set(reactRelPaths);

// Sanity check: if either walk came back empty, the roots resolved wrong
// (e.g. a moved test file) and every other assertion below would trivially
// (and silently) pass — fail loudly instead.
describe("CSS module parity: client-solid vs client-react (docs/adr — copied, not retyped)", () => {
  it("found module.css files to compare on both sides", () => {
    expect(solidRelPaths.length).toBeGreaterThan(0);
    expect(reactRelPaths.length).toBeGreaterThan(0);
  });

  it.each(
    reactRelPaths.filter((rel) => {
      return solidRelPathSet.has(rel);
    }),
  )("%s is byte-identical between client-solid and client-react", (rel) => {
    const reactBytes = readFileSync(join(reactUiRoot, rel));
    const solidBytes = readFileSync(join(solidUiRoot, rel));
    expect(solidBytes.equals(reactBytes)).toBe(true);
  });

  // A Solid-only module.css (no react counterpart at the mirrored path)
  // would be a port INVENTION — the port's whole contract is "copied, not
  // retyped" — so this direction is enforced unconditionally, independent of
  // PARITY_COMPLETE.
  it("every solid module.css has a react counterpart (no port inventions)", () => {
    const orphans = solidRelPaths.filter((rel) => {
      return !reactRelPathSet.has(rel);
    });
    expect(orphans).toEqual([]);
  });

  it.runIf(PARITY_COMPLETE)(
    "every react module.css has a ported solid twin (file sets are identical)",
    () => {
      const missing = reactRelPaths.filter((rel) => {
        return !solidRelPathSet.has(rel);
      });
      expect(missing).toEqual([]);
    },
  );
});

/** Recursively collect every `*.module.css` file under `root`, returned as
 * paths relative to `root` (so the two trees can be compared/keyed by a
 * root-independent identity). */
function findModuleCssFiles(root: string): string[] {
  const out: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".module.css")) {
        out.push(relative(root, full));
      }
    }
  }

  walk(root);
  return out;
}
