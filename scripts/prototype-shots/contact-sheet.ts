// Lays every captured shot out in one image, so the mandatory human review is
// one picture instead of two dozen file-opens.
//
//   pnpm prototype-shots:sheet --out /tmp/proto-scratch --file /tmp/sheet.png
//
// This exists because the review step is the ONE part of the corpus workflow
// that cannot be automated, so it is worth making cheap. It earned its keep
// immediately: the first full capture had `lock/hold` showing an entirely empty
// ring and `equities/trade` showing the Markets tab, and both were obvious at a
// glance on the sheet while being invisible to every gate — each shot was
// internally consistent and its arrival assertion passed.
//
// The sheet is a review aid and is never committed; only the individual shots
// are. It composes in a headless page rather than via an image library, the
// same trick the filmstrip builder uses, so the corpus adds no image-processing
// dependency.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { chromium } from "playwright";

import { argOf } from "./capture";

/** Width of each cell in the sheet. Small enough to fit ~6 per row, large
 * enough that a wrong screen is obvious. */
const CELL_WIDTH_PX = 200;

function pngsUnder(dir: string): string[] {
  const out: string[] = [];

  function walk(current: string): void {
    for (const name of readdirSync(current)) {
      const full = join(current, name);

      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".png")) {
        out.push(full);
      }
    }
  }

  walk(dir);

  return out.sort();
}

function cellHtml(file: string, dir: string): string {
  const id = relative(dir, file).replace(/\.png$/, "");
  const encoded = readFileSync(file).toString("base64");

  return `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:6px">
    <img src="data:image/png;base64,${encoded}" style="width:${CELL_WIDTH_PX}px;border:1px solid #333">
    <figcaption style="font:11px ui-monospace,monospace;color:#9ad">${id}</figcaption>
  </figure>`;
}

export async function buildContactSheet(
  shotsDir: string,
  outFile: string,
): Promise<void> {
  const files = pngsUnder(shotsDir);

  if (files.length === 0) {
    throw new Error(`no PNGs under ${shotsDir}`);
  }

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.setContent(
      `<body style="margin:0;padding:16px;background:#08080c;display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">${files
        .map((file) => {
          return cellHtml(file, shotsDir);
        })
        .join("")}</body>`,
    );
    await page.locator("body").screenshot({ path: outFile });

    console.log(`contact sheet: ${files.length} shots → ${outFile}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("contact-sheet.ts")) {
  buildContactSheet(
    argOf("--out") ?? "/tmp/proto-scratch",
    argOf("--file") ?? "/tmp/proto-contact-sheet.png",
  ).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
