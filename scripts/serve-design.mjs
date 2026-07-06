// Serves the self-contained v2 design prototype over http:// with zero
// dependencies — Node built-ins only (the monorepo already runs on Node).
// The standalone HTML has every script/style/font inlined and does no
// network I/O, so we can read it once and return it for every request.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 8899;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(
  repoRoot,
  "docs/design/v2/standalone/Reactive Trader.html",
);
const html = readFileSync(htmlPath);

createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`\n  Reactive Trader — v2 design prototype`);
  console.log(`  → http://localhost:${port}/\n`);
});
