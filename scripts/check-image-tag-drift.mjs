// Guards the pinned Playwright container image tag against silent drift.
// The image `mcr.microsoft.com/playwright:<tag>` is referenced verbatim in
// several places — the container-based CI workflows and the local
// golden-in-container runner — because there is no single build-time constant
// they can all import (GitHub Actions `container:` takes a literal string, and
// the runner script is a standalone zero-dep ESM file). A "keep in sync"
// comment is the only thing coupling them today, so a bump applied to one file
// but not the others would diverge silently. This check reads every known
// reference, extracts each file's tag, and fails if any file is missing the
// reference or if the tags disagree — so the pin can only ever move in lockstep.
//
// Adding a NEW file that references the image? Add it to `FILES` below (a new
// divergent reference is otherwise invisible to this guard, and that omission
// is what review catches). Note: `.github/workflows/update-visual-goldens.yml`
// is only ever READ here — never written by this script.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every file that references the pinned Playwright container image. Each must
// contain exactly the same `mcr.microsoft.com/playwright:<tag>` string.
const FILES = [
  ".github/workflows/visual.yml",
  ".github/workflows/coverage-report.yml",
  ".github/workflows/update-visual-goldens.yml",
  "scripts/goldens-in-container.mjs",
];

const IMAGE_TAG = /mcr\.microsoft\.com\/playwright:([^\s"'`]+)/;

/** Extract the Playwright image tag referenced in a file, or `null` if the
 * file does not reference the image at all. */
function tagIn(relPath) {
  const source = readFileSync(join(process.cwd(), relPath), "utf8");
  const match = source.match(IMAGE_TAG);

  return match === null ? null : match[1];
}

const found = FILES.map((file) => {
  return { file, tag: tagIn(file) };
});

const missing = found.filter((entry) => {
  return entry.tag === null;
});

if (missing.length > 0) {
  console.error(
    "check-image-tag-drift: expected a `mcr.microsoft.com/playwright:<tag>` " +
      "reference in every listed file, but it is missing from:\n" +
      missing
        .map((entry) => {
          return `  ${entry.file}`;
        })
        .join("\n"),
  );
  process.exit(1);
}

const tags = new Set(
  found.map((entry) => {
    return entry.tag;
  }),
);

if (tags.size === 1) {
  const [tag] = tags;
  console.log(
    `check-image-tag-drift: all ${found.length} references agree on ` +
      `mcr.microsoft.com/playwright:${tag}`,
  );
  process.exit(0);
}

console.error(
  "check-image-tag-drift: the pinned Playwright container image tag has " +
    "drifted — every reference must use the SAME tag. Found:\n" +
    found
      .map((entry) => {
        return `  ${entry.file} → ${entry.tag}`;
      })
      .join("\n"),
);
process.exit(1);
