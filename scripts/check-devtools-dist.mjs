import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("check-devtools-dist: prod /devtools/ bundle OK");
