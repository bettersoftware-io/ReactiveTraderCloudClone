#!/usr/bin/env tsx
// One-shot migration: rewrite >=2-level relative imports to #/ (and #tests/)
// subpath aliases. DELETED after the migration lands (see plan Task 6).
//
// Usage (from anywhere): pnpm -C tests exec tsx scripts/migrate-imports.ts <pkg>
//   <pkg> in { client-react | domain | tests }
// Pass --dry to report counts without writing.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

type AliasMap = ReadonlyArray<readonly [string, string]>; // [relPrefix, aliasPrefix]

const PKGS: Record<string, { dir: string; aliases: AliasMap }> = {
  "client-react": {
    dir: "packages/client-react",
    aliases: [
      ["tests/", "#tests/"],
      ["src/", "#/"],
    ],
  },
  domain: { dir: "packages/domain", aliases: [["src/", "#/"]] },
  tests: { dir: "tests", aliases: [["", "#/"]] },
};

const which = process.argv[2];
const cfg = PKGS[which];
if (!cfg) {
  console.error(`usage: migrate-imports <${Object.keys(PKGS).join(" | ")}>`);
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const repoRoot = execSync("git rev-parse --show-toplevel", {
  encoding: "utf8",
}).trim();
const pkgRoot = resolve(repoRoot, cfg.dir);

const files = execSync(
  `git ls-files "${cfg.dir}/**/*.ts" "${cfg.dir}/**/*.tsx"`,
  { cwd: repoRoot, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.includes("/dist/"))
  .filter((f) => !f.endsWith("scripts/migrate-imports.ts"));

// matches: from "../../x" | from '../../x' | import("../../x") | import('../../x')
const specRe = /(from\s*|import\(\s*)(["'])((?:\.\.\/){2,}[^"']*)\2/g;

let rewrites = 0;
let touchedFiles = 0;
for (const f of files) {
  const abs = resolve(repoRoot, f);
  const src = readFileSync(abs, "utf8");
  let touched = false;
  const out = src.replace(specRe, (_m, pre, q, spec) => {
    const target = resolve(dirname(abs), spec);
    const rel = relative(pkgRoot, target);
    if (rel.startsWith("..")) {
      throw new Error(`${f}: "${spec}" resolves OUTSIDE the package (${rel})`);
    }
    const hit = cfg.aliases.find(([p]) => rel.startsWith(p));
    if (!hit) {
      throw new Error(`${f}: "${spec}" -> "${rel}" matches no alias root`);
    }
    const [relPrefix, aliasPrefix] = hit;
    rewrites += 1;
    touched = true;
    return `${pre}${q}${aliasPrefix}${rel.slice(relPrefix.length)}${q}`;
  });
  if (touched) {
    touchedFiles += 1;
    if (!dry) writeFileSync(abs, out);
  }
}
console.log(
  `${which}: ${dry ? "[dry] would rewrite" : "rewrote"} ${rewrites} imports across ${touchedFiles} files`,
);
