// Asserts the prototype deviation corpus's manifest and its PNG tree agree, in
// BOTH directions: every manifest entry has a file, every file has an entry.
//
// This is NOT a pixel gate and must never become one — see the spec's §2 rule
// (a). A diff against the frozen prototype is permanently non-zero and is never
// a failure. What this catches is the T9 class: a generated artifact committed
// beside its generator with nothing tying the two together, which let the
// Maestro tier sit at 3 flows against 8 scenario ids unnoticed.
//
// Runs under tsx rather than as a sibling `check-*.mjs` under plain node,
// because a .mjs gate would be a plain-node process importing a TypeScript
// manifest — which works only on runtimes that strip types natively, a silent
// dependency on the Node version rather than on anything this repo declares.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { SHOTS, type Shot } from "./shots";

const SHOTS_DIR = join(process.cwd(), "docs/design/mobile/v1/reference-shots");

/** Every .png under `dir`, as ids relative to the shots dir without extension. */
function pngIds(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const out: string[] = [];

  function walk(current: string): void {
    for (const name of readdirSync(current)) {
      const full = join(current, name);

      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".png")) {
        out.push(relative(SHOTS_DIR, full).replace(/\.png$/, ""));
      }
    }
  }

  walk(dir);

  return out;
}

/** A filmstrip shot writes to filmstrips/<id>.png; a still writes to <id>.png. */
function expectedPath(shot: Shot): string {
  return shot.filmstrip === undefined ? shot.id : `filmstrips/${shot.id}`;
}

/** Every path DRIFT.md points at — `<img src>` as well as markdown links.
 *
 * Checked HERE rather than left to `check:doc-links`, which cannot see either:
 * its scope is an explicit allow-list of globs that excludes `docs/design/**`
 * entirely, and even in scope it validates markdown links only, never `<img
 * src>` inside inline HTML — which is what every image on that page is. Both
 * gaps were confirmed by deliberate breakage: a wrong `../` depth and a
 * dangling markdown link each passed `check:doc-links` cleanly. */
function unresolvedDriftRefs(): string[] {
  const page = join(SHOTS_DIR, "DRIFT.md");

  if (!existsSync(page)) {
    return [];
  }

  const text = readFileSync(page, "utf8");
  const refs = new Set<string>();

  for (const [, src] of text.matchAll(/src="([^"]+)"/g)) {
    refs.add(src);
  }

  for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
    refs.add(href);
  }

  return [...refs]
    .filter((ref) => {
      return !/^[a-z]+:/.test(ref) && !existsSync(join(SHOTS_DIR, ref));
    })
    .sort();
}

const expected = new Set(SHOTS.map(expectedPath));
const found = new Set(pngIds(SHOTS_DIR));

const missing = [...expected]
  .filter((id) => {
    return !found.has(id);
  })
  .sort();

const orphaned = [...found]
  .filter((id) => {
    return !expected.has(id);
  })
  .sort();

if (missing.length > 0) {
  console.error(
    `check-prototype-shots: ${missing.length} manifest entries have no PNG:`,
  );

  for (const id of missing) {
    console.error(`  - ${id}`);
  }
}

if (orphaned.length > 0) {
  console.error(
    `check-prototype-shots: ${orphaned.length} PNGs have no manifest entry:`,
  );

  for (const id of orphaned) {
    console.error(`  - ${id}`);
  }
}

const dangling = unresolvedDriftRefs();

if (dangling.length > 0) {
  console.error(
    `check-prototype-shots: ${dangling.length} DRIFT.md references do not resolve:`,
  );

  for (const ref of dangling) {
    console.error(`  - ${ref}`);
  }
}

if (missing.length > 0 || orphaned.length > 0 || dangling.length > 0) {
  process.exit(1);
}

console.log(
  `check-prototype-shots: ${expected.size} shots, manifest and tree agree; DRIFT.md references all resolve`,
);
