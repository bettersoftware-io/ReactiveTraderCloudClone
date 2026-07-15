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
      // Match the PDF sibling case-insensitively, but link its real filename.
      const pdfFile = files.find(
        (sibling) => sibling.toLowerCase() === `${base.toLowerCase()}.pdf`,
      );
      entries.push({
        date,
        title: deriveTitle(file),
        htmlHref: `./${date}/${file}`,
        pdfHref: pdfFile ? `./${date}/${pdfFile}` : null,
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
