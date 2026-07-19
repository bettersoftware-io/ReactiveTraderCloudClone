#!/usr/bin/env node
// Generates showcase/index.html listing every self-contained artifact under a
// showcase directory. Zero dependencies (Node built-ins only), matching the
// sibling scripts/pages/build-presentations-index.mjs.
//
// Usage: node scripts/pages/build-showcase-index.mjs <showcaseDir> <outFile>
//
// Expected layout: <showcaseDir>/<name>.html (flat — no date folders). Unlike the
// presentations index (whose exported <title> holds a slide sentence), these are
// hand-titled pages, so the display title is read from the <title> tag, falling
// back to the filename. index.html is skipped (it is this generated file).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function deriveTitleFromFilename(htmlFilename) {
  return htmlFilename
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function readTitle(filePath, htmlFilename) {
  try {
    const html = readFileSync(filePath, "utf8");
    const match = html.match(/<title>([^<]*)<\/title>/i);
    const title = match?.[1]?.trim();
    if (title) {
      return title;
    }
  } catch {
    // fall through to the filename
  }
  return deriveTitleFromFilename(htmlFilename);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scanShowcase(dir) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const entries = [];
  for (const file of files) {
    if (!/\.html$/i.test(file) || file.toLowerCase() === "index.html") {
      continue;
    }
    entries.push({
      title: readTitle(join(dir, file), file),
      href: `./${file}`,
    });
  }
  entries.sort((a, b) => a.title.localeCompare(b.title));
  return entries;
}

function renderIndexHtml(entries) {
  let rows;
  if (entries.length === 0) {
    rows = "      <li><em>No showcase artifacts published yet.</em></li>";
  } else {
    rows = entries
      .map(
        (entry) =>
          `      <li><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a></li>`,
      )
      .join("\n");
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Showcase — Reactive Trader Cloud</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; }
    ul { padding-left: 1.2rem; } li { margin: .5rem 0; }
    a { color: #0969da; }
    p.lead { opacity: .75; }
    p.back { margin-top: 2rem; font-size: .9rem; }
  </style>
</head>
<body>
  <h1>Showcase</h1>
  <p class="lead">Self-contained HTML artifacts generated on the fly by Claude Code
  while working in this repo — kept as examples of the kind of visual artifact it
  can produce. Each visualizes an authoritative markdown doc. Published from
  <code>docs/showcase/</code> on the default branch.</p>
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
    console.error("usage: build-showcase-index.mjs <showcaseDir> <outFile>");
    process.exit(2);
  }
  const entries = scanShowcase(dir);
  writeFileSync(outFile, renderIndexHtml(entries));
  console.log(`wrote ${outFile} (${entries.length} artifact(s))`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
