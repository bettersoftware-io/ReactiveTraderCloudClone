# Multi-producer GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve GitHub Pages from a `gh-pages` branch where the coverage report and presentation decks each own a subtree, publish independently without clobbering each other, and land the presentation deck already on `main`.

**Architecture:** A `gh-pages` deployment branch holds `/coverage/`, `/presentations/`, and a root hub. Two workflows write to it through one shared, tested Node script (`publish-to-pages.mjs`) that replaces only its own top-level entries and preserves siblings. A second script (`build-presentations-index.mjs`) generates the deck listing. Migration is zero-downtime: the branch is populated while Pages still serves the old artifact, then the maintainer flips the Pages source once.

**Tech Stack:** GitHub Actions, zero-dependency Node ESM scripts (`.mjs`, Node 26), Vitest (subprocess integration tests in `@rtc/tests`), Git LFS, actionlint.

## Global Constraints

- **Node version:** 26 (matches `setup-node` in existing workflows).
- **Root scripts are zero-dependency** — Node built-ins only (like `scripts/check-doc-links.mjs`, `scripts/serve-design.mjs`). No new npm packages.
- **No new GitHub Action** — use only already-pinned `actions/checkout` + `actions/setup-node`; every `uses:` carries an immutable commit SHA + trailing human-version comment (Renovate manages digests).
- **`run:` blocks must be actionlint/shellcheck-clean** — keep them minimal; push logic into the Node scripts. `pnpm lint:actions` is a CI gate.
- **Braces on all control statements** (Biome `useBlockStatements`) — never write brace-less `if`/`for`/`while`. Run `pnpm check:fix` (Biome format+lint autofix) after writing any JS/TS.
- **Markdown links resolve** — `pnpm check:doc-links` gates every relative md link/anchor.
- **Ownership invariant:** each producer writes ONLY its own top-level entry(ies) on `gh-pages`; it must never delete a sibling producer's subtree.
- **LFS:** the `publish-site` workflow's `actions/checkout` MUST set `lfs: true` (deck HTML is a 4.3 MB LFS object; a plain checkout copies the 3-line pointer).
- **Concurrency:** both writer workflows share `concurrency: { group: pages-write, cancel-in-progress: false }` (repo-global by name → serializes the two workflows).
- **Auth:** pushes use the ambient `GITHUB_TOKEN` (persisted on `origin` by `actions/checkout`); writer jobs need `permissions: { contents: write }`. `GITHUB_TOKEN` pushes do not trigger workflows, and `gh-pages` is outside CI's `push: branches:[main]` filter — no loops.
- **Target site:** `https://bettersoftware-io.github.io/ReactiveTraderCloudClone/`.

---

### Task 1: `build-presentations-index.mjs` + tests

Generates `presentations/index.html` from the deck folders. Title derives from the **filename** (not the `<title>` tag — exports put a slide sentence there). Newest folder first; link the `.pdf` when a sibling exists.

**Files:**
- Create: `scripts/pages/build-presentations-index.mjs`
- Create: `tests/scripts/pages/build-index.test.ts`
- Modify: `tests/package.json` (add `test:pages` script)
- Modify: `.github/workflows/ci.yml` (add a gate step)

**Interfaces:**
- Produces (CLI contract): `node scripts/pages/build-presentations-index.mjs <presentationsDir> <outFile>` — scans `<presentationsDir>/<YYYY-MM-DD>/*.html`, writes an HTML index to `<outFile>`, exits 0. Consumed by Task 4's workflow.

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/pages/build-index.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/build-presentations-index.mjs",
);

let tmp = "";
afterEach(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function fixture(): string {
  tmp = mkdtempSync(join(tmpdir(), "pi-"));
  mkdirSync(join(tmp, "2026-07-14"), { recursive: true });
  writeFileSync(join(tmp, "2026-07-14", "Clean-Architecture-case-study.html"), "x");
  writeFileSync(join(tmp, "2026-07-14", "Clean-Architecture-case-study.pdf"), "x");
  mkdirSync(join(tmp, "2026-06-01"), { recursive: true });
  writeFileSync(join(tmp, "2026-06-01", "Intro_Talk.html"), "x");
  return tmp;
}

describe("build-presentations-index", () => {
  it("derives titles from filenames, lists newest first, links the PDF", () => {
    const dir = fixture();
    const out = join(dir, "index.html");
    execFileSync("node", [SCRIPT, dir, out]);
    const html = readFileSync(out, "utf8");

    expect(html).toContain(">Clean Architecture case study<");
    expect(html).toContain(">Intro Talk<");
    expect(html).toContain('href="./2026-07-14/Clean-Architecture-case-study.html"');
    expect(html).toContain('href="./2026-07-14/Clean-Architecture-case-study.pdf"');
    // No PDF sibling for the intro talk → no pdf link for it.
    expect(html).not.toContain("2026-06-01/Intro_Talk.pdf");
    // Newest folder first.
    expect(html.indexOf("Clean Architecture")).toBeLessThan(html.indexOf("Intro Talk"));
  });

  it("renders an empty-state row when there are no decks", () => {
    tmp = mkdtempSync(join(tmpdir(), "pi-"));
    const out = join(tmp, "index.html");
    execFileSync("node", [SCRIPT, tmp, out]);
    expect(readFileSync(out, "utf8")).toContain("No presentations published yet");
  });
});
```

Add to `tests/package.json` scripts (next to `test:report`):

```json
    "test:pages": "vitest run scripts/pages",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests test:pages`
Expected: FAIL — the script file does not exist (`execFileSync` error / ENOENT).

- [ ] **Step 3: Write the script**

Create `scripts/pages/build-presentations-index.mjs`:

```js
#!/usr/bin/env node
// Generates presentations/index.html listing every deck under a presentations
// directory. Zero dependencies (Node built-ins only), matching the other repo
// build-tooling scripts (scripts/check-doc-links.mjs, scripts/serve-design.mjs).
//
// Usage: node scripts/pages/build-presentations-index.mjs <presentationsDir> <outFile>
//
// Expected layout: <presentationsDir>/<YYYY-MM-DD>/<Some-Deck-Name>.html (+ .pdf)
// The display title is derived from the HTML FILENAME (kebab/underscore -> spaced);
// the <title> tag is deliberately ignored (exports store a slide sentence there).
// The folder name supplies the date. Decks are listed newest-first.

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function deriveTitle(htmlFilename) {
  return htmlFilename
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scanPresentations(dir) {
  let dateDirs;
  try {
    dateDirs = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries = [];
  for (const dirent of dateDirs) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const date = dirent.name;
    const files = readdirSync(join(dir, date));
    for (const file of files) {
      if (!/\.html$/i.test(file)) {
        continue;
      }
      const base = file.replace(/\.html$/i, "");
      const hasPdf = files.includes(`${base}.pdf`);
      entries.push({
        date,
        title: deriveTitle(file),
        htmlHref: `./${date}/${file}`,
        pdfHref: hasPdf ? `./${date}/${base}.pdf` : null,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.title.localeCompare(b.title);
  });
  return entries;
}

function renderIndexHtml(entries) {
  let rows;
  if (entries.length === 0) {
    rows = "      <li><em>No presentations published yet.</em></li>";
  } else {
    rows = entries
      .map((entry) => {
        const pdf = entry.pdfHref
          ? ` · <a href="${escapeHtml(entry.pdfHref)}">PDF</a>`
          : "";
        return `      <li><a href="${escapeHtml(entry.htmlHref)}">${escapeHtml(entry.title)}</a> <span class="date">${escapeHtml(entry.date)}</span>${pdf}</li>`;
      })
      .join("\n");
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Presentations — Reactive Trader Cloud</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; }
    ul { padding-left: 1.2rem; } li { margin: .5rem 0; }
    a { color: #0969da; } .date { opacity: .6; font-size: .85rem; }
    p.back { margin-top: 2rem; font-size: .9rem; }
  </style>
</head>
<body>
  <h1>Presentations</h1>
  <p>Published from <code>docs/presentations/&lt;date&gt;/</code> on the default branch.</p>
  <ul>
${rows}
  </ul>
  <p class="back"><a href="../">↩ site home</a></p>
</body>
</html>
`;
}

function main() {
  const [dir, outFile] = process.argv.slice(2);
  if (!dir || !outFile) {
    console.error(
      "usage: build-presentations-index.mjs <presentationsDir> <outFile>",
    );
    process.exit(2);
  }
  const entries = scanPresentations(dir);
  writeFileSync(outFile, renderIndexHtml(entries));
  console.log(`wrote ${outFile} (${entries.length} deck(s))`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Format + lint the new JS**

Run: `pnpm check:fix && pnpm biome check scripts/pages tests/scripts/pages`
Expected: no errors (Biome may reformat the multi-line blocks — that is fine).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/tests test:pages`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire the CI gate**

In `.github/workflows/ci.yml`, add a step in the fast job immediately after the existing `pnpm test` step (match the surrounding `- name:` / `run:` style):

```yaml
      - name: Pages tooling unit tests
        run: pnpm --filter @rtc/tests test:pages
```

Run: `pnpm lint:actions`
Expected: PASS (actionlint clean).

- [ ] **Step 7: Commit**

```bash
git add scripts/pages/build-presentations-index.mjs tests/scripts/pages/build-index.test.ts tests/package.json .github/workflows/ci.yml
git commit -m "feat(pages): presentations index generator + CI-gated tests"
```

---

### Task 2: `publish-to-pages.mjs` + coexistence test

The shared writer. Replaces each top-level entry of a staging dir on `gh-pages`, preserves all siblings, orphan-initialises the branch if missing, pushes with fetch+rebase retry.

**Files:**
- Create: `scripts/pages/publish-to-pages.mjs`
- Create: `tests/scripts/pages/publish-to-pages.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (CLI contract): `node scripts/pages/publish-to-pages.mjs --source <dir> [--branch gh-pages] [--remote origin] [--message <msg>]`. Operates on the `origin` remote of the current working directory. Consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/pages/publish-to-pages.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/publish-to-pages.mjs",
);

let root = "";
afterEach(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function stage(base: string, name: string, files: Record<string, string>): string {
  const dir = join(base, name);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function publish(cwd: string, source: string, message: string): void {
  execFileSync("node", [SCRIPT, "--source", source, "--message", message], {
    cwd,
    encoding: "utf8",
  });
}

describe("publish-to-pages", () => {
  it("keeps two producers' subtrees side by side and preserves shared root files", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const bare = join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "main", bare]);

    // Seed origin/main with one commit so `git worktree add --detach` has a base.
    const seed = join(root, "seed");
    execFileSync("git", ["clone", bare, seed]);
    writeFileSync(join(seed, "README.md"), "seed");
    git(seed, "config", "user.email", "t@t");
    git(seed, "config", "user.name", "t");
    git(seed, "add", "-A");
    git(seed, "commit", "-m", "seed");
    git(seed, "push", "origin", "main");

    const work = join(root, "work");
    execFileSync("git", ["clone", bare, work]);

    // Producer A publishes { alpha/, root.txt }; Producer B publishes { beta/ }.
    publish(work, stage(root, "stageA", { "alpha/a.txt": "A", "root.txt": "shared" }), "A");
    publish(work, stage(root, "stageB", { "beta/b.txt": "B" }), "B");

    const verify = join(root, "verify");
    execFileSync("git", ["clone", "-b", "gh-pages", bare, verify]);
    const top = readdirSync(verify).filter((f) => f !== ".git").sort();

    expect(top).toContain("alpha"); // producer A subtree survived producer B's publish
    expect(top).toContain("beta"); // producer B subtree present
    expect(top).toContain("root.txt"); // shared root file preserved
  });

  it("is a no-op when the source content is unchanged", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const bare = join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "main", bare]);
    const seed = join(root, "seed");
    execFileSync("git", ["clone", bare, seed]);
    writeFileSync(join(seed, "README.md"), "seed");
    git(seed, "config", "user.email", "t@t");
    git(seed, "config", "user.name", "t");
    git(seed, "add", "-A");
    git(seed, "commit", "-m", "seed");
    git(seed, "push", "origin", "main");

    const work = join(root, "work");
    execFileSync("git", ["clone", bare, work]);
    const s = stage(root, "stageA", { "alpha/a.txt": "A" });
    publish(work, s, "first");
    const before = git(work, "rev-parse", "refs/remotes/origin/gh-pages");
    publish(work, s, "second"); // identical content
    git(work, "fetch", "origin", "gh-pages");
    const after = git(work, "rev-parse", "refs/remotes/origin/gh-pages");
    expect(after).toBe(before); // no new commit
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests test:pages`
Expected: FAIL — `publish-to-pages.mjs` does not exist.

- [ ] **Step 3: Write the script**

Create `scripts/pages/publish-to-pages.mjs`:

```js
#!/usr/bin/env node
// Publishes a staging directory into the gh-pages branch WITHOUT disturbing
// sibling subtrees owned by other producers. Each top-level entry of <source>
// replaces the same-named entry on the branch; every other branch entry is
// preserved. Orphan-initialises the branch if it does not exist. Pushes with a
// fetch+rebase retry loop so two producers racing on the branch serialise
// cleanly (they touch disjoint entries, so the rebase never conflicts).
//
// Zero dependencies (Node built-ins only). Git credentials come from the ambient
// checkout (actions/checkout persists them on `origin`).
//
// Usage:
//   node scripts/pages/publish-to-pages.mjs --source <dir> [--branch gh-pages]
//        [--remote origin] [--message <commit message>]

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function main() {
  const source = flag("source");
  const branch = flag("branch", "gh-pages");
  const remote = flag("remote", "origin");
  const message = flag("message", `publish to ${branch}`);
  if (!source) {
    console.error(
      "usage: publish-to-pages.mjs --source <dir> [--branch gh-pages] [--remote origin] [--message <msg>]",
    );
    process.exit(2);
  }

  const owned = readdirSync(source);
  if (owned.length === 0) {
    console.log("nothing to publish (empty source)");
    return;
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  const work = mkdtempSync(join(tmpdir(), "pages-"));
  let branchExists = false;
  try {
    git(["fetch", "--no-tags", remote, `+refs/heads/${branch}:${remoteRef}`]);
    git(["rev-parse", "--verify", "--quiet", remoteRef]);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  try {
    if (branchExists) {
      git(["worktree", "add", "-B", branch, work, remoteRef]);
    } else {
      git(["worktree", "add", "--detach", work]);
      git(["checkout", "--orphan", branch], work);
      try {
        git(["rm", "-rf", "--quiet", "."], work);
      } catch {
        // Orphan index already empty — nothing to clear.
      }
    }

    for (const entry of owned) {
      rmSync(join(work, entry), { recursive: true, force: true });
      cpSync(join(source, entry), join(work, entry), { recursive: true });
    }

    git(["config", "user.email", "github-actions[bot]@users.noreply.github.com"], work);
    git(["config", "user.name", "github-actions[bot]"], work);
    git(["add", "-A"], work);
    if (git(["status", "--porcelain"], work) === "") {
      console.log("no changes to publish");
      return;
    }
    git(["commit", "-m", message], work);

    let pushed = false;
    for (let attempt = 1; attempt <= 5 && !pushed; attempt++) {
      try {
        git(["push", remote, branch], work);
        pushed = true;
      } catch {
        console.log(`push rejected (attempt ${attempt}); rebasing on ${branch}`);
        git(["fetch", "--no-tags", remote, `+refs/heads/${branch}:${remoteRef}`], work);
        git(["rebase", remoteRef], work);
      }
    }
    if (!pushed) {
      throw new Error(`failed to push ${branch} after retries`);
    }
    console.log(`published [${owned.join(", ")}] to ${branch}`);
  } finally {
    try {
      git(["worktree", "remove", "--force", work]);
    } catch {
      // best-effort cleanup
    }
    rmSync(work, { recursive: true, force: true });
  }
}

main();
```

- [ ] **Step 4: Format + lint**

Run: `pnpm check:fix && pnpm biome check scripts/pages tests/scripts/pages`
Expected: no errors.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/tests test:pages`
Expected: PASS (4 tests total across both files).

- [ ] **Step 6: Commit**

```bash
git add scripts/pages/publish-to-pages.mjs tests/scripts/pages/publish-to-pages.test.ts
git commit -m "feat(pages): shared gh-pages subtree publisher (preserves sibling producers)"
```

---

### Task 3: `docs/pages/` scaffold (root hub + `.nojekyll` + README)

The site source that lives in `main`.

**Files:**
- Create: `docs/pages/index.html`
- Create: `docs/pages/.nojekyll`
- Create: `docs/pages/README.md`

**Interfaces:**
- Produces: root-level files the `publish-site` workflow (Task 4) stages into the branch root.

- [ ] **Step 1: Create the root hub** `docs/pages/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reactive Trader Cloud — project site</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 1rem 0; }
    a.card { display: block; padding: 1rem 1.2rem; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; text-decoration: none; color: inherit; }
    a.card:hover { border-color: #0969da; }
    a.card strong { color: #0969da; }
    p.desc { margin: .25rem 0 0; opacity: .7; font-size: .9rem; }
  </style>
</head>
<body>
  <h1>Reactive Trader Cloud</h1>
  <p>Project site. Each section is published independently.</p>
  <ul>
    <li><a class="card" href="./presentations/"><strong>Presentations →</strong><p class="desc">Architecture &amp; case-study decks.</p></a></li>
    <li><a class="card" href="./coverage/"><strong>Coverage report →</strong><p class="desc">Latest istanbul HTML coverage, per tier (on-demand).</p></a></li>
  </ul>
</body>
</html>
```

- [ ] **Step 2: Create** `docs/pages/.nojekyll` (empty file — disables Jekyll so `_`-prefixed paths serve raw):

```bash
: > docs/pages/.nojekyll
```

- [ ] **Step 3: Create** `docs/pages/README.md`:

```markdown
# Project site (`gh-pages`)

GitHub Pages serves this repo's site from the **`gh-pages` branch** (Settings →
Pages → *Deploy from a branch* → `gh-pages` / root). The branch is a pure
deployment artifact — never edit it by hand.

## Layout & ownership

| Path on `gh-pages`      | Owner                                   |
|-------------------------|-----------------------------------------|
| `/index.html`, `.nojekyll` | this folder (`docs/pages/`)          |
| `/presentations/**`     | `.github/workflows/publish-site.yml`    |
| `/coverage/**`          | `.github/workflows/coverage-report.yml` |

Each producer writes only its own subtree via
`scripts/pages/publish-to-pages.mjs`, which replaces its top-level entries and
preserves the others — so the two never clobber each other.

## Add a presentation

Commit the deck to `main` under a dated folder:

```
docs/presentations/<YYYY-MM-DD>/<Nice-File-Name>.html   (+ .pdf, both LFS-tracked)
```

On push to `main`, `publish-site.yml` republishes all decks and regenerates the
index. The display title comes from the **filename** (`Nice-File-Name` →
"Nice File Name"), the date from the folder.

## One-time setup (maintainer)

Flipping the Pages source is a Pages-admin action the repo PAT cannot perform:
**Settings → Pages → Source → Deploy from a branch → `gh-pages` / (root)**.
```

- [ ] **Step 4: Verify doc links**

Run: `pnpm check:doc-links`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/pages/index.html docs/pages/.nojekyll docs/pages/README.md
git commit -m "feat(pages): docs/pages site scaffold (root hub, .nojekyll, README)"
```

---

### Task 4: `publish-site.yml` workflow

Auto-publishes the hub + presentations on push to `main`.

**Files:**
- Create: `.github/workflows/publish-site.yml`

**Interfaces:**
- Consumes: `build-presentations-index.mjs` (Task 1), `publish-to-pages.mjs` (Task 2), `docs/pages/*` (Task 3), `docs/presentations/**` (already on `main`).

- [ ] **Step 1: Write the workflow.** Look up the pinned SHAs actually used in the repo (copy them verbatim from `.github/workflows/coverage-report.yml`) for `actions/checkout` and `actions/setup-node`, then create `.github/workflows/publish-site.yml`:

```yaml
name: Publish Site

# Publishes the root hub (docs/pages/) and all presentation decks
# (docs/presentations/) to the gh-pages branch, which GitHub Pages serves.
# Coverage is published separately by coverage-report.yml; each workflow owns a
# disjoint subtree via scripts/pages/publish-to-pages.mjs, so neither clobbers
# the other. Shares the `pages-write` concurrency group with coverage so the two
# writers serialise.
on:
  push:
    branches: [main]
    paths:
      - docs/presentations/**
      - docs/pages/**
  workflow_dispatch:

concurrency:
  group: pages-write
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      # lfs: true materialises the real deck bytes, not the 3-line LFS pointer.
      - uses: actions/checkout@<PINNED_SHA>  # v7  (copy from coverage-report.yml)
        with:
          lfs: true

      - uses: actions/setup-node@<PINNED_SHA>  # v6.4.0  (copy from coverage-report.yml)
        with:
          node-version: 26

      - name: Stage hub + presentations
        run: |
          rm -rf _stage
          mkdir -p _stage/presentations
          cp docs/pages/index.html _stage/index.html
          cp docs/pages/.nojekyll _stage/.nojekyll
          cp -R docs/presentations/. _stage/presentations/
          node scripts/pages/build-presentations-index.mjs docs/presentations _stage/presentations/index.html

      - name: Publish to gh-pages
        run: >
          node scripts/pages/publish-to-pages.mjs
          --source _stage
          --message "publish site: hub + presentations @ ${GITHUB_SHA}"
```

- [ ] **Step 2: Lint the workflow**

Run: `pnpm lint:actions`
Expected: PASS (actionlint clean, including shellcheck of the `run:` blocks).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-site.yml
git commit -m "feat(pages): publish-site workflow (hub + presentations, auto on main)"
```

---

### Task 5: Migrate `coverage-report.yml` to branch-write

Swap the artifact-model deploy for a branch-write into `/coverage/`. Leave the entire coverage-generation + `_site` assembly untouched.

**Files:**
- Modify: `.github/workflows/coverage-report.yml`

- [ ] **Step 1: Shrink the job permissions.** Replace the `coverage` job's block

```yaml
    permissions:
      contents: read
      pages: write
      id-token: write
```

with:

```yaml
    permissions:
      contents: write
```

- [ ] **Step 2: Add the `pages-write` concurrency group.** Directly under `on:` (top level), add:

```yaml
concurrency:
  group: pages-write
  cancel-in-progress: false
```

- [ ] **Step 3: Replace the publish tail.** Delete these three steps from the `coverage` job — `Configure Pages`, `Upload Pages artifact`, and `Coverage summary link` — and delete the entire second `deploy:` job. In place of the removed steps (after `Assemble Pages site`), add:

```yaml
      - name: Publish coverage to gh-pages
        run: |
          rm -rf _stage
          mkdir -p _stage
          cp -R _site _stage/coverage
          node scripts/pages/publish-to-pages.mjs --source _stage --message "publish coverage @ ${GITHUB_SHA}"

      - name: Live report link
        run: |
          url="https://bettersoftware-io.github.io/ReactiveTraderCloudClone/coverage/"
          echo "Live HTML coverage report: $url"
          echo "::notice title=Coverage report (live HTML)::Browse the full report → $url"
```

Also remove the header comment block that describes the two-job least-privilege split (lines describing `build`/`deploy` pages permissions), since there is now one job. Keep the `node` toolchain available — the `coverage` job already runs `actions/setup-node`, so `node scripts/pages/...` resolves.

- [ ] **Step 4: Lint the workflow**

Run: `pnpm lint:actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/coverage-report.yml
git commit -m "refactor(pages): coverage-report writes /coverage on gh-pages (branch model)"
```

---

### Task 6: Migration & cutover (operational — run after PR merges)

Not a code change: the ordered runbook to go live with **zero downtime**. The live site keeps serving the old artifact until Step 4.

**Interfaces:**
- Consumes: all prior tasks, merged to `main`.

- [ ] **Step 1: Merge the feature PR to `main`.** The merge touches `docs/pages/**`, so `publish-site.yml` fires automatically — it creates the `gh-pages` orphan branch and populates the root hub + `/presentations/` (including the deck already on `main`). Confirm the run is green:

Run: `gh run list --workflow "Publish Site" --json status,conclusion,headSha --limit 3`
Expected: a `completed`/`success` run for the merge SHA.

- [ ] **Step 2: Populate `/coverage/`.** Dispatch the migrated coverage workflow:

Run: `gh workflow run coverage-report.yml`
Then poll: `gh run list --workflow "Coverage Report" --json status,conclusion --limit 3`
Expected: `completed`/`success`.

- [ ] **Step 3: Inspect the branch (pre-flip proof).**

```bash
git fetch origin gh-pages
git ls-tree -r --long origin/gh-pages | grep -E 'index.html|\.nojekyll|coverage/|presentations/'
```

Expected: `.nojekyll` + `index.html` at root; `coverage/index.html`; `presentations/index.html` + `presentations/2026-07-14/Clean-Architecture-case-study.html`. Verify the deck blob size is ~4.3 MB (the real HTML, **not** a ~130-byte LFS pointer):

```bash
git cat-file -s "$(git rev-parse origin/gh-pages:presentations/2026-07-14/Clean-Architecture-case-study.html)"
```
Expected: `434####` (≈ 4.3 million), not ~130.

- [ ] **Step 4: Maintainer flips the Pages source (manual — the one hands-on step).**
Settings → Pages → Source → **Deploy from a branch** → `gh-pages` / **(root)** → Save.
(The repo PAT is expected to 403 on this Pages-admin API, so it is done in the UI.)

- [ ] **Step 5: Verify live (post-flip proof).**

```bash
base=https://bettersoftware-io.github.io/ReactiveTraderCloudClone
for u in "/" "/coverage/" "/presentations/" "/presentations/2026-07-14/Clean-Architecture-case-study.html"; do
  printf '%s -> ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "$base$u"
done
```
Expected: `200` for each. Spot-check the deck URL renders the real deck (title bar, slides), and `/presentations/` lists "Clean Architecture case study".

---

## Self-Review

**Spec coverage:**
- Branch model / one-owner-per-subtree → Tasks 2, 4, 5 (`publish-to-pages` invariant + the two writers). ✓
- Root hub sourced from `main` → Task 3 (`docs/pages/`), staged by Task 4. ✓
- Presentations auto-publish on push to `main`, full idempotent sync → Task 4 (`paths` trigger; `cp -R docs/presentations/.` + regenerate index every run). ✓
- Filename-derived titles → Task 1 (`deriveTitle`, asserted in test). ✓
- Coverage migrated without touching generation; permissions shrink to `contents: write` → Task 5. ✓
- LFS handling → Global Constraints + Task 4 `lfs: true` + Task 6 Step 3 size check. ✓
- Race serialization → `pages-write` concurrency group (Tasks 4, 5) + rebase-retry (Task 2) + no-op idempotency test. ✓
- CI-trigger safety → Global Constraints (documented; `gh-pages` outside `push:branches:[main]`, `GITHUB_TOKEN` no-trigger). ✓
- Zero-downtime migration + manual source-flip → Task 6. ✓
- README / how-to-add-a-deck → Task 3. ✓
- Pre-flip/post-flip verification → Task 6 Steps 3 & 5. ✓

**Placeholder scan:** The only intentional `<PINNED_SHA>` placeholders are in Task 4, with an explicit instruction to copy the verbatim pinned digests from `coverage-report.yml` (they must match the repo's Renovate-managed pins, so hard-coding a possibly-stale SHA here would be worse). No other placeholders.

**Type/name consistency:** CLI contracts are stable across tasks — `build-presentations-index.mjs <dir> <outFile>` (Task 1 defines, Task 4 calls); `publish-to-pages.mjs --source <dir> --message <msg>` (Task 2 defines, Tasks 4 & 5 call). Staging dir is `_stage` in both workflows. Concurrency group `pages-write` identical in Tasks 4 & 5.
