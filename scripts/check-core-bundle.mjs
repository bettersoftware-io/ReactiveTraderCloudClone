#!/usr/bin/env node
// Builds each web client once per application core into a temp dir and
// asserts a build that selected core X shipped no other core's runtime.
// Report-only for size; a hard gate for leakage.
import { execSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const CLIENTS = ["@rtc/client-react", "@rtc/client-solid"];
const CORES = ["rxjs", "async", "effect"];
const MARKERS = {
  effect: "effect/Fiber",
  async: "@rtc/client-core-async:brand",
};

function listJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...listJs(p));
    } else if (entry.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;
const rows = [];
for (const client of CLIENTS) {
  for (const core of CORES) {
    const outDir = mkdtempSync(join(tmpdir(), "rtc-core-bundle-"));
    execSync(
      `pnpm --filter ${client} exec vite build --outDir ${outDir} --emptyOutDir`,
      {
        stdio: "inherit",
        env: { ...process.env, VITE_CORE_IMPL: core },
      },
    );
    const files = listJs(outDir);
    const code = files.map((f) => readFileSync(f, "utf8")).join("\n");
    const gz = files.reduce(
      (sum, f) => sum + gzipSync(readFileSync(f)).length,
      0,
    );
    rows.push({ client, core, gzKB: (gz / 1024).toFixed(1) });
    for (const [other, marker] of Object.entries(MARKERS)) {
      const present = code.includes(marker);
      if (other !== core && present) {
        console.error(
          `FAIL ${client} [${core}] contains the ${other} core (${marker})`,
        );
        failed = true;
      }
      if (other === core && !present) {
        console.error(
          `FAIL ${client} [${core}] does not contain its own marker (${marker}) — is selectCore wired?`,
        );
        failed = true;
      }
    }
    rmSync(outDir, { recursive: true, force: true });
  }
}
console.table(rows);
process.exit(failed ? 1 : 0);
