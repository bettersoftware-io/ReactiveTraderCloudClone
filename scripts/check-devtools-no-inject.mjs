import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "packages/client-react/dist/assets");
const SENTINEL = "intent:invoke";

function jsFilesUnder(dir) {
  const out = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...jsFilesUnder(full));
    } else if (full.endsWith(".js")) {
      out.push(full);
    }
  }

  return out;
}

const offenders = [];

for (const file of jsFilesUnder(assetsDir)) {
  if (readFileSync(file, "utf8").includes(SENTINEL)) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-devtools-no-inject: the production app bundle still contains the ` +
      `"${SENTINEL}" intent-injection handler — dev-only dead-code ` +
      `elimination failed (the DevtoolsHub gate must be ` +
      `\`import.meta.env.DEV && msg.kind === "intent:invoke"\`). Offenders:\n` +
      offenders.join("\n"),
  );
  process.exit(1);
}

console.log(
  "check-devtools-no-inject: production app bundle is injection-free",
);
