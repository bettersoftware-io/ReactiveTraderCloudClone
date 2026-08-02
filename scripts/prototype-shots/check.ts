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

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { SHOTS, type Shot } from "./shots";

const SHOTS_DIR = join(process.cwd(), "docs/design/mobile/v1/reference-shots");

/** Every .png under `dir`, as ids relative to the shots dir without extension. */
function pngIds(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".png")) {
        out.push(relative(SHOTS_DIR, full).replace(/\.png$/, ""));
      }
    }
  };
  walk(dir);

  return out;
}

/** A filmstrip shot writes to filmstrips/<id>.png; a still writes to <id>.png. */
function expectedPath(shot: Shot): string {
  return shot.filmstrip === undefined ? shot.id : `filmstrips/${shot.id}`;
}

const expected = new Set(SHOTS.map(expectedPath));
const found = new Set(pngIds(SHOTS_DIR));

const missing = [...expected].filter((id) => !found.has(id)).sort();
const orphaned = [...found].filter((id) => !expected.has(id)).sort();

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

if (missing.length > 0 || orphaned.length > 0) {
  process.exit(1);
}

console.log(
  `check-prototype-shots: ${expected.size} shots, manifest and tree agree`,
);
