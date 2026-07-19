# Visual-Diff Failure Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the `visual` workflow's diff results to GitHub Pages at `/visual/` — a wall of `reference|actual|diff` thumbnails for every failed scenario (with drill-through to each tier's native report), or an "all green" page when nothing failed — so a broken visual run is inspectable in one click instead of a download-extract-open zip.

**Architecture:** A new zero-dep Node generator (`scripts/pages/build-visual-report.mjs`) scans both web clients' on-disk visual-diff artifacts, copies the PNGs + native tier reports into a staging dir, and emits `index.html`. The existing `scripts/pages/publish-to-pages.mjs` pushes that staging dir to the `gh-pages` `/visual/` subtree (disjoint from `/coverage/`). `.github/workflows/visual.yml` is edited so both client steps always run, then the report is built and published on every run (pass or fail), with a final gate step keeping the job status honest.

**Tech Stack:** Node built-ins only (no new deps), Vitest 4 (test in the `@rtc/tests` workspace), GitHub Actions, Playwright container image.

## Global Constraints

- **Zero runtime dependencies** in `build-visual-report.mjs` — Node built-ins only, matching `scripts/pages/build-presentations-index.mjs` and `publish-to-pages.mjs`.
- **Mandatory braces on every control statement** (Biome `style/useBlockStatements`, repo-wide) — brace-less `if`/`for` fails CI. No nested ternaries; use braced `if`.
- **Lint gauntlet is broader than Biome:** the change must pass `biome ci .`, both ESLint configs, and `pnpm --filter @rtc/tests typecheck`. Run `eslint . --fix` and `biome check --write` before pushing.
- **Publish target:** `gh-pages` branch, `/visual/` top-level entry only. Never touch `/coverage/` or the hub — `publish-to-pages.mjs` replaces only same-named top-level entries.
- **Live URL:** `https://bettersoftware-io.github.io/ReactiveTraderCloudClone/visual/`.
- **The `visual` job stays post-merge-only** (`push: main` + `workflow_dispatch`). This plan changes only what a run publishes, not when it runs.
- **Repo shipping rules** (`shipping-repo-changes` skill): all work in the already-created worktree on branch `worktree-visual-diff-report`; PR + green CI + merge-commit; read CI via `gh run list --workflow CI` (never `gh pr checks`).

## File Structure

| File | Responsibility |
|---|---|
| `scripts/pages/build-visual-report.mjs` | **new** — scan both clients' diff artifacts → copy assets + tier reports → emit wall/green `index.html`. Zero-dep. |
| `tests/scripts/pages/build-visual-report.test.ts` | **new** — fixture-driven unit tests (run in CI via `pnpm --filter @rtc/tests test:pages`). |
| `.github/workflows/visual.yml` | **edit** — both client steps `continue-on-error`; `if: always()` build+publish; `contents: write`; `::notice`; final gate step; artifact upload condition fix. |
| `docs/pages/index.html` | **edit (optional, Task 4)** — add a `/visual/` link beside coverage on the hub. |

---

## Task 1: The report generator (`build-visual-report.mjs`)

**Files:**
- Create: `scripts/pages/build-visual-report.mjs`
- Test: `tests/scripts/pages/build-visual-report.test.ts`

**Interfaces:**
- Consumes: nothing (leaf script). Invoked as a CLI, exactly like the sibling scripts.
- Produces: a CLI with this contract (later consumed by the workflow in Task 3):
  ```
  node scripts/pages/build-visual-report.mjs \
    --out <dir> \
    [--react <pkgDir>] [--solid <pkgDir>] \
    [--branch <b>] [--sha <s>] [--run-url <u>]
  ```
  Writes `<dir>/index.html` always; when failures exist, also `<dir>/assets/**` (copied PNGs) and `<dir>/reports/<pkg>/<tier>/**` (copied native reports). Exit code 0 on success. Prints a one-line summary (`wrote <dir>/index.html (<n> failing scenario(s))` or `... (all green)`).

**Discovery contract** (what counts as a failure): a file ending `-diff.png` under `<pkgDir>/reports/ui/visual` or `<pkgDir>/tests/ui/visual`. For each, the sibling `-actual.png` is the "after"; the reference ("before") is the sibling `-expected.png` (Playwright artifacts) or, failing that, `<base>.png` (vitest-browser golden). The tier is the path segment immediately after `.../ui/visual/`.

- [ ] **Step 1: Write the failing green-path test**

Create `tests/scripts/pages/build-visual-report.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/build-visual-report.mjs",
);

let tmp = "";
afterEach(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

// Writes a file (and any parent dirs), returning its path. Content is a tiny
// non-empty PNG-ish byte so copies are observable; the generator never decodes.
function put(path: string, content = "x"): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

describe("build-visual-report — green path", () => {
  it("emits an all-green page when no -diff.png images exist", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    // A tier ran and passed: report dir exists, but no diff images.
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--sha",
      "abc1234",
      "--branch",
      "main",
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).toContain("All visual tiers green");
    expect(html).toContain("abc1234");
    expect(html).not.toContain("assets/");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/pages/build-visual-report.test.ts`
Expected: FAIL — the script does not exist yet (`execFileSync` throws / module not found).

- [ ] **Step 3: Implement the skeleton + green page**

Create `scripts/pages/build-visual-report.mjs`:

```js
#!/usr/bin/env node
// Scans the visual-diff tiers' on-disk failure images for the web clients and
// emits a browsable /visual/ site: a "wall of broken screens" (reference |
// actual | diff per failed scenario) linking into each tier's native HTML
// report, or a tiny "all green" page when nothing failed. Zero dependencies
// (Node built-ins only), matching scripts/pages/build-presentations-index.mjs.
//
// Usage:
//   node scripts/pages/build-visual-report.mjs --out <dir> \
//     [--react <pkgDir>] [--solid <pkgDir>] \
//     [--branch <b>] [--sha <s>] [--run-url <u>]

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Recursively list every file under dir. Missing/unreadable dir → [].
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

// The tier is the path segment immediately after ".../ui/visual/".
function tierOf(path) {
  const parts = path.split("/");
  const index = parts.lastIndexOf("visual");
  if (index >= 0 && parts[index + 1]) {
    return parts[index + 1];
  }
  return "unknown";
}

const PAGE_STYLE = `
    :root { color-scheme: light dark; }
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
    .meta { opacity: .7; font-size: .9rem; }
    .scenario { margin: 1.2rem 0; padding-top: .6rem; border-top: 1px solid #8883; }
    .scenario h3 { font-size: .95rem; margin: 0 0 .4rem; font-family: ui-monospace, monospace; }
    .trip { display: flex; gap: .6rem; flex-wrap: wrap; align-items: flex-start; }
    .trip figure { margin: 0; }
    .trip figcaption { font-size: .75rem; opacity: .7; }
    .trip img { max-width: 22rem; width: 100%; height: auto; border: 1px solid #8884; background: #8881; }
    a { color: #0969da; }
    footer { margin-top: 2.5rem; font-size: .85rem; opacity: .8; }`;

function renderGreen(meta) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual diffs — ${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>✓ All visual tiers green</h1>
  <p class="meta">${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)} · generated ${escapeHtml(meta.generated)}</p>
  <p>No visual diffs in the latest run — every scenario matched its golden.</p>
  <footer><a href="${escapeHtml(meta.runUrl)}">↩ workflow run</a></footer>
</body>
</html>
`;
}

function main() {
  const out = flag("out");
  if (!out) {
    console.error(
      "usage: build-visual-report.mjs --out <dir> [--react <dir>] [--solid <dir>] [--branch <b>] [--sha <s>] [--run-url <u>]",
    );
    process.exit(2);
  }
  const sha = flag("sha", "local");
  const meta = {
    branch: flag("branch", "local"),
    shortSha: sha.slice(0, 7),
    generated: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    runUrl: flag("run-url", "#"),
  };

  mkdirSync(out, { recursive: true });
  // Green path only for now; Step 7 adds the failure wall.
  writeFileSync(join(out, "index.html"), renderGreen(meta));
  console.log(`wrote ${join(out, "index.html")} (all green)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/pages/build-visual-report.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing wall tests**

Append to `tests/scripts/pages/build-visual-report.test.ts`:

```ts
describe("build-visual-report — failure wall", () => {
  it("renders a triple + report link per failed scenario, copying assets", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    const solid = join(tmp, "client-solid");

    // Playwright tier (react): artifacts carry -expected/-actual/-diff together.
    const pwArt = join(react, "reports/ui/visual/playwright/react/artifacts/fx");
    put(join(pwArt, "fx-tile-stale-expected.png"));
    put(join(pwArt, "fx-tile-stale-actual.png"));
    put(join(pwArt, "fx-tile-stale-diff.png"));
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    // vitest-browser tier (react): -actual/-diff sit next to the golden <base>.png.
    const vbShots = join(
      react,
      "tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx",
    );
    put(join(vbShots, "analytics-empty.png")); // golden = reference
    put(join(vbShots, "analytics-empty-actual.png"));
    put(join(vbShots, "analytics-empty-diff.png"));

    // Solid tier: its own artifacts tree.
    const solidArt = join(
      solid,
      "reports/ui/visual/playwright/solid/artifacts/app",
    );
    put(join(solidArt, "app-fx-system-expected.png"));
    put(join(solidArt, "app-fx-system-actual.png"));
    put(join(solidArt, "app-fx-system-diff.png"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--solid",
      solid,
      "--sha",
      "def5678",
      "--branch",
      "main",
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    // Every failing scenario appears.
    expect(html).toContain("fx-tile-stale");
    expect(html).toContain("analytics-empty");
    expect(html).toContain("app-fx-system");
    // Grouped by package + tier.
    expect(html).toContain("client-react");
    expect(html).toContain("client-solid");
    expect(html).toContain("playwright");
    expect(html).toContain("vitest-browser");
    // before/after/diff labels present.
    expect(html).toContain("reference");
    expect(html).toContain("actual");
    expect(html).toContain("diff");
    // Drill-through to the native report was copied + linked.
    expect(html).toContain("reports/client-react/playwright/index.html");
    // Assets were physically copied into the site.
    expect(
      readFileSync(
        join(
          out,
          "assets/client-react/reports/ui/visual/playwright/react/artifacts/fx/fx-tile-stale-diff.png",
        ),
        "utf8",
      ),
    ).toBe("x");
  });

  it("resolves the vitest-browser golden as the reference image", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    const vbShots = join(
      react,
      "tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx",
    );
    put(join(vbShots, "tile-loading.png"), "REF");
    put(join(vbShots, "tile-loading-actual.png"), "ACT");
    put(join(vbShots, "tile-loading-diff.png"), "DIF");

    execFileSync("node", [SCRIPT, "--out", out, "--react", react]);

    // The golden <base>.png was copied as the reference asset.
    const refAsset = join(
      out,
      "assets/client-react/tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx/tile-loading.png",
    );
    expect(readFileSync(refAsset, "utf8")).toBe("REF");
  });
});
```

- [ ] **Step 6: Run the wall tests to verify they fail**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/pages/build-visual-report.test.ts`
Expected: the two new tests FAIL (the green-only script emits no wall, no assets); the green test still PASSES.

- [ ] **Step 7: Implement the failure scan + asset/report copy + wall**

In `scripts/pages/build-visual-report.mjs`, add the scan/copy/render helpers below **above** `main`, then replace `main`'s body so it renders the wall when failures exist and the green page otherwise.

Add these functions (after `tierOf`):

```js
// One failed scenario, normalized across tiers.
// { package, tier, scenario, group, referencePath, actualPath, diffPath }
function scanPackage(label, pkgDir) {
  const files = [
    ...walk(join(pkgDir, "reports/ui/visual")),
    ...walk(join(pkgDir, "tests/ui/visual")),
  ];
  const failures = [];
  for (const diffPath of files) {
    if (!diffPath.endsWith("-diff.png")) {
      continue;
    }
    const dir = dirname(diffPath);
    const base = basename(diffPath).slice(0, -"-diff.png".length);
    const actualPath = join(dir, `${base}-actual.png`);
    const expectedPath = join(dir, `${base}-expected.png`);
    const goldenPath = join(dir, `${base}.png`);
    let referencePath = null;
    if (existsSync(expectedPath)) {
      referencePath = expectedPath;
    } else if (existsSync(goldenPath)) {
      referencePath = goldenPath;
    }
    failures.push({
      package: label,
      tier: tierOf(diffPath),
      scenario: base,
      group: relative(pkgDir, dir),
      referencePath,
      actualPath: existsSync(actualPath) ? actualPath : null,
      diffPath,
    });
  }
  return failures;
}

// Copy a source PNG into <out>/assets/<label>/<relPathInsidePkg>, returning the
// site-relative href. Sanitizes only characters illegal on disk; keeps the path
// shape so assets never collide across tiers/themes.
function copyAsset(out, label, pkgDir, srcPath) {
  if (!srcPath) {
    return null;
  }
  const rel = join(label, relative(pkgDir, srcPath)).replace(/\\/g, "/");
  const dest = join(out, "assets", rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(srcPath, dest);
  return `./assets/${rel}`;
}

// Find each tier's native HTML report dir under <pkgDir>/reports/ui/visual and
// copy it to <out>/reports/<label>/<tier>/, returning { "label/tier": href }.
function copyTierReports(out, label, pkgDir) {
  const reports = {};
  for (const file of walk(join(pkgDir, "reports/ui/visual"))) {
    if (!file.endsWith("/report/index.html")) {
      continue;
    }
    const tier = tierOf(file);
    const key = `${label}/${tier}`;
    if (reports[key]) {
      continue;
    }
    const reportDir = dirname(file);
    const destDir = join(out, "reports", label, tier);
    mkdirSync(dirname(destDir), { recursive: true });
    cpSync(reportDir, destDir, { recursive: true });
    reports[key] = `./reports/${label}/${tier}/index.html`;
  }
  return reports;
}

function figure(href, caption) {
  if (!href) {
    return `<figure><figcaption>${caption} — <em>missing</em></figcaption></figure>`;
  }
  return `<figure><img loading="lazy" src="${escapeHtml(href)}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
}

function renderWall(failures, reports, meta) {
  // Group: package → tier → [scenario rows].
  const groups = new Map();
  for (const f of failures) {
    const pkgMap = groups.get(f.package) ?? new Map();
    const rows = pkgMap.get(f.tier) ?? [];
    rows.push(f);
    pkgMap.set(f.tier, rows);
    groups.set(f.package, pkgMap);
  }

  let body = "";
  for (const [pkg, tiers] of groups) {
    for (const [tier, rows] of tiers) {
      const reportHref = reports[`${pkg}/${tier}`];
      const link = reportHref
        ? ` — <a href="${escapeHtml(reportHref)}">open in slider ↗</a>`
        : "";
      body += `  <h2>${escapeHtml(pkg)} · ${escapeHtml(tier)} <span class="meta">(${rows.length} failed)</span>${link}</h2>\n`;
      for (const f of rows) {
        body += `  <div class="scenario"><h3>${escapeHtml(f.group)}/${escapeHtml(f.scenario)}</h3><div class="trip">`;
        body += figure(f.reference, "reference");
        body += figure(f.actual, "actual");
        body += figure(f.diff, "diff");
        body += `</div></div>\n`;
      }
    }
  }

  // "Full tier reports" footer — every report that exists, incl. tiers with no
  // diff rows (e.g. a non-visual failure), so nothing is silently dropped.
  let reportList = "";
  for (const [key, href] of Object.entries(reports)) {
    reportList += `      <li><a href="${escapeHtml(href)}">${escapeHtml(key)}</a></li>\n`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual diffs — ${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)} — ${failures.length} failed</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>Visual diffs — ${failures.length} failing scenario(s)</h1>
  <p class="meta">${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)} · generated ${escapeHtml(meta.generated)}</p>
${body}  <footer>
    <h2>Full tier reports</h2>
    <ul>
${reportList}    </ul>
    <a href="${escapeHtml(meta.runUrl)}">↩ workflow run</a>
  </footer>
</body>
</html>
`;
}
```

Then replace the body of `main` after the `mkdirSync(out, ...)` line with:

```js
  mkdirSync(out, { recursive: true });

  const packages = [
    ["client-react", flag("react")],
    ["client-solid", flag("solid")],
  ].filter(([, dir]) => Boolean(dir));

  const failures = [];
  const reports = {};
  for (const [label, dir] of packages) {
    for (const f of scanPackage(label, dir)) {
      f.reference = copyAsset(out, label, dir, f.referencePath);
      f.actual = copyAsset(out, label, dir, f.actualPath);
      f.diff = copyAsset(out, label, dir, f.diffPath);
      failures.push(f);
    }
    Object.assign(reports, copyTierReports(out, label, dir));
  }

  if (failures.length === 0) {
    writeFileSync(join(out, "index.html"), renderGreen(meta));
    console.log(`wrote ${join(out, "index.html")} (all green)`);
    return;
  }
  writeFileSync(join(out, "index.html"), renderWall(failures, reports, meta));
  console.log(
    `wrote ${join(out, "index.html")} (${failures.length} failing scenario(s))`,
  );
```

(Remove the old green-only `writeFileSync`/`console.log` lines that Step 3 put in `main`.)

- [ ] **Step 8: Run all generator tests to verify they pass**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/pages/build-visual-report.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 9: Lint + typecheck the new files**

Run: `pnpm exec biome check --write scripts/pages/build-visual-report.mjs tests/scripts/pages/build-visual-report.test.ts && pnpm exec eslint scripts/pages/build-visual-report.mjs tests/scripts/pages/build-visual-report.test.ts --fix && pnpm --filter @rtc/tests typecheck`
Expected: no errors. Re-run Step 8 if the formatter changed anything.

- [ ] **Step 10: Commit**

```bash
git add scripts/pages/build-visual-report.mjs tests/scripts/pages/build-visual-report.test.ts
git commit -m "feat(visual): build-visual-report.mjs — wall/green generator for gh-pages"
```

---

## Task 2: Wire the report into `visual.yml`

**Files:**
- Modify: `.github/workflows/visual.yml`

**Interfaces:**
- Consumes: `build-visual-report.mjs` CLI (Task 1) and the existing `scripts/pages/publish-to-pages.mjs`.
- Produces: on every `visual` run, `/visual/` on `gh-pages` is refreshed; the job still fails when any tier failed.

- [ ] **Step 1: Grant the job write access**

Under `jobs.visual:` (after `runs-on: ubuntu-latest`), add:

```yaml
    permissions:
      contents: write
```

- [ ] **Step 2: Make both client steps always run, with step ids**

Add `id:` and `continue-on-error: true` to each existing test step so a red react run no longer skips solid:

```yaml
      - name: Visual diffs — react (playwright-ct + playwright + vitest-browser)
        id: visual_react
        continue-on-error: true
        run: pnpm test:ui:visual --filter=@rtc/client-react

      - name: Visual diffs — solid (playwright-ct fallback + playwright + vitest-browser)
        id: visual_solid
        continue-on-error: true
        run: pnpm test:ui:visual --filter=@rtc/client-solid
```

- [ ] **Step 3: Build + publish the report (runs on pass AND fail)**

Insert **after** the solid step and **before** the existing artifact-upload step:

```yaml
      # Build the browsable /visual/ report from whatever diff images the two
      # steps above produced (none on a green run → an "all green" page), then
      # publish it to the gh-pages /visual/ subtree (disjoint from /coverage/;
      # publish-to-pages.mjs's rebase loop serialises concurrent writers). Runs
      # on pass and fail alike so a green run overwrites a stale red report.
      - name: Build visual report site
        if: always()
        run: |
          RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
          rm -rf _stage
          mkdir -p _stage/visual
          node scripts/pages/build-visual-report.mjs \
            --out _stage/visual \
            --react packages/client-react \
            --solid packages/client-solid \
            --branch "${GITHUB_REF_NAME}" --sha "${GITHUB_SHA}" --run-url "$RUN_URL"

      - name: Publish visual report to gh-pages
        if: always()
        run: |
          # The Playwright container checkout is owned by a different user than
          # git runs as; clear the dubious-ownership guard before the worktree
          # add inside publish-to-pages (mirrors coverage-report.yml).
          git config --global --add safe.directory "$GITHUB_WORKSPACE"
          node scripts/pages/publish-to-pages.mjs --source _stage --message "publish visual report @ ${GITHUB_SHA}"

      - name: Live report link
        if: always()
        run: |
          url="https://bettersoftware-io.github.io/ReactiveTraderCloudClone/visual/"
          echo "Live visual diff report: $url"
          echo "::notice title=Visual diff report (live HTML)::Browse the report → $url"
```

- [ ] **Step 4: Fix the artifact-upload condition**

Because both test steps now use `continue-on-error`, the job is not in a "failure" state at this point, so the existing `if: failure()` would never fire. Change that step's condition to key off the step outcomes:

```yaml
      - name: Upload visual diff report on failure
        if: ${{ always() && (steps.visual_react.outcome == 'failure' || steps.visual_solid.outcome == 'failure') }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: ui-visual-report
          path: |
            packages/client-react/reports/
            packages/client-react/tests/ui/visual/**/__screenshots__/**/*-actual.png
            packages/client-react/tests/ui/visual/**/__screenshots__/**/*-diff.png
            packages/client-react/tests/ui/visual/**/__screenshots__/**/*-reference.png
            packages/client-solid/reports/
          if-no-files-found: ignore
          retention-days: 7
```

- [ ] **Step 5: Add the final gate step (keeps job status honest)**

Add as the **last** step in the job:

```yaml
      # continue-on-error above lets both clients run and the report publish even
      # on failure; re-assert the real result here so the post-merge signal (and
      # this job's status) is still red when any tier failed.
      - name: Gate — fail if any visual tier failed
        if: always()
        run: |
          if [ "${{ steps.visual_react.outcome }}" = "failure" ] || [ "${{ steps.visual_solid.outcome }}" = "failure" ]; then
            echo "::error title=Visual diffs failed::One or more tiers failed — see the published report."
            exit 1
          fi
          echo "All visual tiers passed."
```

- [ ] **Step 6: Validate the workflow YAML + generator wiring locally**

Run:
```bash
node --check scripts/pages/build-visual-report.mjs
node scripts/pages/build-visual-report.mjs --out /tmp/vr-green/visual --react packages/client-react --solid packages/client-solid --sha localtest --branch main && grep -q "All visual tiers green" /tmp/vr-green/visual/index.html && echo "green OK"
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/visual.yml')); print('yaml OK')"
```
Expected: `green OK` (no diff images exist in a clean checkout → all-green page) and `yaml OK`.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/visual.yml
git commit -m "ci(visual): publish diff report to gh-pages /visual/ every run"
```

---

## Task 3: (Optional) Link `/visual/` from the docs hub

Only do this if `docs/pages/index.html` has a coverage link to sit beside; skip otherwise.

**Files:**
- Modify: `docs/pages/index.html`

- [ ] **Step 1: Inspect the hub**

Run: `grep -n "coverage" docs/pages/index.html`
If there is no coverage link, **skip this task** (nothing to mirror).

- [ ] **Step 2: Add the visual link**

Beside the coverage link, add an anchor to
`./visual/` labelled e.g. "Visual diff report" (match the surrounding markup exactly — copy the coverage `<li>`/`<a>` shape and swap href + text).

- [ ] **Step 3: Commit**

```bash
git add docs/pages/index.html
git commit -m "docs(pages): link the visual diff report from the hub"
```

---

## Final Verification (before PR / merge)

Run the relevant slice of the gauntlet from the worktree root:

```bash
pnpm --filter @rtc/tests test:pages       # includes the new generator tests
pnpm --filter @rtc/tests typecheck
pnpm exec biome ci .                       # format + lint + import-sort (CI parity)
pnpm exec eslint . --fix                   # second lint layer beyond Biome
```

Expected: all green. Then follow **shipping-repo-changes**: push `worktree-visual-diff-report`, open the PR, poll `gh run list --workflow CI` until the run for your HEAD SHA is `completed`/`success`, merge with `--merge`, confirm on `origin/main`, and remove the worktree.

**Post-merge acceptance** (the only way to exercise the `visual` job, which is post-merge/dispatch-only): trigger `visual` via `workflow_dispatch` and confirm the green page publishes to `/visual/`. To exercise the failure wall, either dispatch on a commit with a known visual regression or temporarily perturb a golden on a throwaway branch; confirm the wall renders `reference|actual|diff` triples with working drill-through links, then confirm a subsequent green run overwrites it with the all-green page.

## Self-Review Notes

- **Spec coverage:** wall shape + grouping + drill-through (Task 1 renderWall); green-overwrites-red (Task 1 main + Task 2 `if: always()` publish); failed-only-by-construction (discovery keys off `-diff.png`); both-clients-always-run + honest job status (Task 2 Steps 2/5); disjoint `/visual/` subtree + reused publish primitive (Task 2 Step 3); "Full tier reports" footer for non-visual failures (Task 1 renderWall); zero-dep + fixture tests (Task 1); optional hub link (Task 3). No spec requirement is left without a task.
- **Type/name consistency:** the failure record fields (`package`, `tier`, `scenario`, `group`, `referencePath`/`reference`, `actualPath`/`actual`, `diffPath`/`diff`) are produced by `scanPackage` + augmented in `main`, and consumed unchanged by `renderWall`/`figure`. The `reports` map is keyed `"<label>/<tier>"` in both `copyTierReports` and `renderWall`.
- **Known limitation (documented in spec):** a tier that fails for a non-visual reason with no `-diff.png` and no `report/index.html` contributes neither a wall row nor a footer link; the job still goes red (gate) and the raw zip artifact is still uploaded as the fallback.
