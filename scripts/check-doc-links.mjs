// Repo-wide markdown link/anchor checker. Walks every in-scope .md file,
// extracts relative `[text](target)` links, and confirms each target file
// exists and — for links into another markdown file with a `#fragment` —
// that the fragment matches a heading slug in that file (computed with
// github-slugger, the same slugger GitHub itself uses). External links
// (anything with a URL scheme, e.g. `https:`) are skipped.
//
// Scope: README.md, CLAUDE.md, docs/*.md, docs/architecture/**/*.md,
// docs/adr/*.md, docs/research/*.md, docs/superpowers/specs/*.md,
// tests/**/*.md, packages/*/README.md.
//
// `docs/superpowers/plans/**` is deliberately excluded: those are
// point-in-time SDD plan documents. They quote link syntax as prose examples
// (e.g. this very checker's own brief demonstrates `[x](no-such-file.md)`
// as an example of a broken link) and reference paths for docs that later
// tasks in the same plan create — neither is a real broken link in the
// living documentation set this checker guards.

import fs, { globSync } from "node:fs";
import path from "node:path";

import Slugger from "github-slugger";

const root = process.cwd();
const patterns = [
  "README.md",
  "CLAUDE.md",
  "docs/*.md",
  "docs/architecture/**/*.md",
  "docs/adr/*.md",
  "docs/research/*.md",
  "docs/superpowers/specs/*.md",
  "tests/**/*.md",
  "packages/*/README.md",
];
const sources = [
  ...new Set(
    patterns.flatMap((p) =>
      globSync(p, { cwd: root, exclude: (f) => f.includes("node_modules") }),
    ),
  ),
].sort();

const slugCache = new Map();
function slugsOf(file) {
  if (slugCache.has(file)) {
    return slugCache.get(file);
  }
  const slugger = new Slugger();
  const set = new Set();
  let fence = false;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      continue;
    }
    const m = line.match(/^#{1,6} (.+)$/);
    if (m) {
      set.add(slugger.slug(m[1].replace(/\s+#*$/, "")));
    }
  }
  slugCache.set(file, set);
  return set;
}

const errors = [];
let checked = 0;
for (const rel of sources) {
  const abs = path.join(root, rel);
  let fence = false;
  fs.readFileSync(abs, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return;
      }
      if (fence) {
        return;
      }
      // Blank out inline code spans (`...`) before scanning for links: prose
      // that *shows* link syntax inside backticks is not a real link. Only
      // the link scan strips spans — heading slugs (slugsOf) must be computed
      // from the original text, since GitHub keeps inline-code text in slugs.
      const scannable = line.replace(/`[^`]*`/g, "");
      for (const m of scannable.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/.test(target) || target.startsWith("//")) {
          continue;
        }
        const [p, frag] = target.split("#");
        const resolved =
          p === ""
            ? abs
            : path.resolve(path.dirname(abs), decodeURIComponent(p));
        checked++;
        if (!fs.existsSync(resolved)) {
          errors.push(`${rel}:${i + 1} missing file -> ${target}`);
          continue;
        }
        if (
          frag &&
          resolved.endsWith(".md") &&
          !slugsOf(resolved).has(decodeURIComponent(frag))
        ) {
          errors.push(`${rel}:${i + 1} missing anchor -> ${target}`);
        }
      }
    });
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `check-doc-links: ${checked} links OK across ${sources.length} files`,
);
