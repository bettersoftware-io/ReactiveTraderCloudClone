// Throwaway: lay every scratch shot out in one page and screenshot it, so a
// human (and I) can review the whole set at once instead of 21 file opens.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { chromium } from "playwright";

const DIR = process.argv[2];
const OUT = process.argv[3];
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : n.endsWith(".png") && files.push(f); } };
walk(DIR);
files.sort();

const cells = files.map((f) => {
  const id = relative(DIR, f).replace(/\.png$/, "");
  const b64 = readFileSync(f).toString("base64");
  return `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:6px">
    <img src="data:image/png;base64,${b64}" style="width:200px;border:1px solid #333">
    <figcaption style="font:11px ui-monospace,monospace;color:#9ad">${id}</figcaption>
  </figure>`;
}).join("");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.setContent(`<body style="margin:0;padding:16px;background:#08080c;display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">${cells}</body>`);
await page.locator("body").screenshot({ path: OUT });
console.log(`contact sheet: ${files.length} shots → ${OUT}`);
await browser.close();
