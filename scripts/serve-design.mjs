// Serves a self-contained Claude Design prototype over http:// with zero
// dependencies — Node built-ins only (the monorepo already runs on Node).
// Each standalone HTML has every script/style/font inlined and does no
// network I/O, so we can read it once and return it for every request.
//
// Which prototype: pass a repo-relative path as the first CLI arg. Defaults to
// the current web design (v5). Examples:
//   node scripts/serve-design.mjs                                   # web v5
//   node scripts/serve-design.mjs "docs/design/mobile/v1/standalone/Reactive Trader Mobile.html"
//
// v5's standalone HTML is Git LFS-tracked, so a fresh clone needs `git lfs pull`
// before this can serve real bytes (otherwise it would serve the LFS pointer).

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HTML = "docs/design/web/v5/standalone/Reactive Trader.html";

const port = Number(process.env.PORT) || 8899;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const relPath = process.argv[2] || DEFAULT_HTML;
const html = readFileSync(join(repoRoot, relPath));

createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`\n  Reactive Trader — design prototype`);
  console.log(`  serving ${relPath}`);
  console.log(`  → http://localhost:${port}/\n`);
});
