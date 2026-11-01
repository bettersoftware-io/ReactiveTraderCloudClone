import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const indexPath = join(
  process.cwd(),
  "packages/client-react/dist/devtools/index.html",
);

if (!existsSync(indexPath)) {
  console.error(
    `check-devtools-dist: missing ${indexPath}. The prod /devtools/ copy ` +
      `(client-react vite closeBundle) did not run or wrote elsewhere. ` +
      `Run \`pnpm build\` first.`,
  );
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");

if (!html.includes("/devtools/")) {
  console.error(
    `check-devtools-dist: ${indexPath} does not reference /devtools/ assets — ` +
      `the devtools-app base path may be wrong.`,
  );
  process.exit(1);
}

// The deployed site sends `script-src 'self'`, which blocks an inline script —
// so the React DevTools guard must be a module, not a `<script>` in the page.
if (/<script(?![^>]*\ssrc=)/.test(html)) {
  console.error(
    "check-devtools-dist: the prod /devtools/ page has an inline <script>; " +
      "the Content-Security-Policy (script-src 'self') would block it — " +
      "see docs/architecture/20-devtools.md §20.10",
  );
  process.exit(1);
}

const entry = /<script[^>]*\ssrc="\/devtools\/(assets\/[^"]+\.js)"/.exec(html);
const entryChunk =
  entry === null ? undefined : join(dirname(indexPath), entry[1]);

// Witness: `react-devtools` (the opt-out query the guard reads) occurs once, in
// the guard. `__REACT_DEVTOOLS_GLOBAL_HOOK__` would not do: react-dom in the
// same chunk names it too. The guard must also precede the first React code,
// because react-dom reads the hook as it evaluates.
const chunk =
  entryChunk !== undefined && existsSync(entryChunk)
    ? readFileSync(entryChunk, "utf8")
    : "";
const guardAt = chunk.indexOf("react-devtools");
const reactAt = chunk.indexOf("react.transitional.element");

if (guardAt === -1 || reactAt === -1 || guardAt > reactAt) {
  console.error(
    "check-devtools-dist: the React DevTools guard is missing from the prod " +
      "/devtools/ entry chunk, or comes after the first React code — see " +
      "docs/architecture/20-devtools.md §20.10",
  );
  process.exit(1);
}

console.log("check-devtools-dist: prod /devtools/ bundle OK");
