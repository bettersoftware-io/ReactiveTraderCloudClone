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
//     [--branch <b>] [--sha <s>] [--run-url <u>] \
//     [--failed "<space-separated package labels that failed>"]

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

// One failed scenario, normalized across tiers.
// { package, tier, scenario, group, referencePath, actualPath, diffPath }
//
// `extraDirs` covers the shared @rtc/ui-contract goldens tree
// (packages/ui-contract/goldens/<tier>/__screenshots__/): every tier writes
// its failure debris (-actual.png / -diff.png) next to the golden it
// compared against, and BOTH clients' playwright/playwright-ct tiers (plus
// react's own vitest-browser tier) resolve their snapshotDir/screenshot path
// there — only client-solid's vitest-browser tier keeps its diffs local
// (tests/ui/visual/vitest-browser/__diffs__/, walked via pkgDir above). The
// caller passes this only for the "client-react" scan (see main()), mirroring
// the pre-relocation behavior where solid's cross-package writes into
// client-react's own tree were likewise reported under the "client-react"
// label.
function scanPackage(label, pkgDir, extraDirs = []) {
  const files = [
    ...walk(join(pkgDir, "reports/ui/visual")),
    ...walk(join(pkgDir, "tests/ui/visual")),
    ...extraDirs.flatMap((dir) => walk(dir)),
  ].sort();
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
// site-relative href. Normalizes backslashes to `/` so the copied asset's href
// is a valid forward-slash URL path; keeps the path shape so assets never
// collide across tiers/themes.
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
  for (const file of walk(join(pkgDir, "reports/ui/visual")).sort()) {
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

// An honest page for the "a tier crashed before producing any -diff.png"
// case: distinct from renderGreen (nothing to compare, but NOT all green)
// and from renderWall (no per-scenario image trips to show). Still links
// every native tier report found, so a report that did render (e.g. a
// sibling package's) stays reachable.
function renderNoDiff(failedLabels, reports, meta) {
  let reportList = "";
  for (const [key, href] of Object.entries(reports)) {
    reportList += `      <li><a href="${escapeHtml(href)}">${escapeHtml(key)}</a></li>\n`;
  }
  const failedList = failedLabels.map((label) => escapeHtml(label)).join(", ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>⚠ Visual tiers failed — no snapshot diffs — ${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>⚠ Visual tiers failed — no snapshot diffs</h1>
  <p class="meta">${escapeHtml(meta.branch)} @ ${escapeHtml(meta.shortSha)} · generated ${escapeHtml(meta.generated)}</p>
  <p>One or more visual tiers failed (<strong>${failedList}</strong>) without producing
  any snapshot diff images — likely a build error, timeout, or crash rather than
  a pixel mismatch. This page cannot show a before/after/diff wall because no
  such images exist.</p>
  <p>Check the workflow run's uploaded artifact and the linked native tier
  report(s) below for the actual failure.</p>
  <footer>
    <h2>Full tier reports</h2>
    <ul>
${reportList}    </ul>
    <a href="${escapeHtml(meta.runUrl)}">↩ workflow run</a>
  </footer>
</body>
</html>
`;
}

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
      "usage: build-visual-report.mjs --out <dir> [--react <dir>] [--solid <dir>] [--branch <b>] [--sha <s>] [--run-url <u>] [--failed <labels>]",
    );
    process.exit(2);
  }
  const sha = flag("sha", "local");
  const meta = {
    branch: flag("branch", "local"),
    shortSha: sha.slice(0, 7),
    generated: `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`,
    runUrl: flag("run-url", "#"),
  };
  const failedLabels = flag("failed", "")
    .split(/\s+/)
    .filter((label) => label !== "");

  mkdirSync(out, { recursive: true });

  const packages = [
    ["client-react", flag("react")],
    ["client-solid", flag("solid")],
  ].filter(([, dir]) => Boolean(dir));

  // Scan every package first, WITHOUT copying anything. A green run must
  // leave <out>/assets and <out>/reports untouched — only known once every
  // package has been scanned.
  const scanned = [];
  for (const [label, dir] of packages) {
    // The shared @rtc/ui-contract goldens tree is a workspace sibling of
    // client-react (../ui-contract/goldens relative to --react's dir) — see
    // scanPackage's doc comment for why only the "client-react" scan walks it.
    const extraDirs =
      label === "client-react"
        ? [join(dirname(dir), "ui-contract/goldens")]
        : [];
    for (const f of scanPackage(label, dir, extraDirs)) {
      scanned.push([label, dir, f]);
    }
  }

  if (scanned.length === 0) {
    if (failedLabels.length > 0) {
      // A tier failed (build error, timeout, crash) without producing any
      // -diff.png — an "all green" page would misrepresent a red job. Copy
      // every requested package's tier reports (so native report links
      // still work) and render an honest failure page instead.
      const reports = {};
      for (const [label, dir] of packages) {
        Object.assign(reports, copyTierReports(out, label, dir));
      }
      writeFileSync(
        join(out, "index.html"),
        renderNoDiff(failedLabels, reports, meta),
      );
      console.log(
        `wrote ${join(out, "index.html")} (${failedLabels.length} tier(s) failed, no diff images)`,
      );
      return;
    }
    writeFileSync(join(out, "index.html"), renderGreen(meta));
    console.log(`wrote ${join(out, "index.html")} (all green)`);
    return;
  }

  // Failures exist somewhere: copy per-scenario assets, and every requested
  // package's tier reports (not just the ones with failures — a fully-green
  // sibling package's report must still be copied + linked so nothing is
  // silently dropped from the "Full tier reports" footer).
  const failures = [];
  const reports = {};
  for (const [label, dir, f] of scanned) {
    f.reference = copyAsset(out, label, dir, f.referencePath);
    f.actual = copyAsset(out, label, dir, f.actualPath);
    f.diff = copyAsset(out, label, dir, f.diffPath);
    failures.push(f);
  }
  for (const [label, dir] of packages) {
    Object.assign(reports, copyTierReports(out, label, dir));
  }

  writeFileSync(join(out, "index.html"), renderWall(failures, reports, meta));
  console.log(
    `wrote ${join(out, "index.html")} (${failures.length} failing scenario(s))`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
