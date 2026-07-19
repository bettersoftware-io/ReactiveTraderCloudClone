#!/usr/bin/env node
// Render / verify the canonical `react/` visual golden set inside the pinned x86
// Playwright container, so goldens are byte-identical to CI regardless of host
// architecture.
//
// Why: native rendering drifts across CPU architectures (measured ~30% of pixels
// arm64 vs x86 — font rasterisation, not availability), which is the whole reason
// the repo committed a second `react-local/<arch>` set. But the SAME container,
// emulated via `--platform linux/amd64`, reproduces CI's x86 output byte-for-byte
// (proven 2026-07-18, 30/30 across all three tiers). So any machine with Docker
// can regenerate or verify the canonical set locally — no CI round-trip, no
// artifact download, no cherry-pick. See
// docs/superpowers/specs/2026-07-18-single-container-golden-set-design.md.
//
//   pnpm goldens:verify   # assert the committed react/ set (the local CI-exact gate)
//   pnpm goldens:regen    # rewrite react/ into the working tree, ready to commit
//
// Runs the full react/ set across all three tiers. Requires Docker (Desktop /
// colima) with the daemon running. First run is slower (image pull + amd64
// install under emulation); later runs reuse the layer + a persistent pnpm store.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with the container tag in ci.yml / visual.yml / update-visual-goldens.yml.
const IMAGE = "mcr.microsoft.com/playwright:v1.61.0-noble";

const TIERS = ["playwright", "playwright-ct", "vitest-browser"];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const mode = process.argv[2];
if (mode !== "regen" && mode !== "verify") {
  console.error("usage: goldens-in-container.mjs <regen|verify>");
  process.exit(2);
}
const update = mode === "regen";

if (spawnSync("docker", ["version"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "Docker is required and its daemon must be running. Start Docker Desktop (or colima) and retry.",
  );
  process.exit(1);
}

const outDir = resolve(repoRoot, ".golden-out");
if (update) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

// Inside the container: copy source to /build (isolate from the host's arm64
// node_modules), install + build for amd64, then run all three visual tiers with
// CI=1 so the configs route to the canonical `react/` baseline.
const flag = update ? "--update-snapshots" : "";
const vitestFlag = update ? "--update" : "";
const inner = [
  "set -e",
  "mkdir -p /build && cd /build",
  'tar -C /src --exclude=node_modules --exclude=.git --exclude=.claude --exclude=dist --exclude="*.tsbuildinfo" -cf - . | tar -xf -',
  "corepack enable",
  "echo '[install]' && pnpm install --frozen-lockfile --store-dir /pnpm-store 2>&1 | tail -1",
  "echo '[build]' && pnpm build 2>&1 | tail -1",
  "cd packages/client-react",
  `echo '[playwright]' && npx playwright test -c tests/ui/visual/playwright/playwright.config.ts ${flag}`,
  `echo '[playwright-ct]' && npx playwright test -c tests/ui/visual/playwright-ct/playwright-ct.config.ts ${flag}`,
  `echo '[vitest-browser]' && npx vitest run -c tests/ui/visual/vitest-browser/vitest-browser.config.ts ${vitestFlag}`,
  update
    ? 'for t in playwright playwright-ct vitest-browser; do d="../ui-contract/goldens/$t/__screenshots__/react"; if [ -d "$d" ]; then mkdir -p "/out/$t"; cp -r "$d/." "/out/$t/"; fi; done'
    : 'echo "[verify] all tiers passed against the committed react/ set"',
].join("\n");

const dockerArgs = [
  "run",
  "--rm",
  "--platform",
  "linux/amd64",
  "-v",
  `${repoRoot}:/src:ro`,
  "-v",
  "rtc-goldens-pnpm-store:/pnpm-store",
  ...(update ? ["-v", `${outDir}:/out`] : []),
  "-e",
  "CI=1",
  "-e",
  "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
  "-e",
  "CYPRESS_INSTALL_BINARY=0",
  "-e",
  "RTC_VISUAL_MAX_PARALLEL=1",
  IMAGE,
  "bash",
  "-lc",
  inner,
];

console.log(`[goldens] ${mode} in ${IMAGE} (emulated linux/amd64)…`);
const res = spawnSync("docker", dockerArgs, { stdio: "inherit" });
if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

if (update) {
  // Copy the container-produced react/ trees back into the working tree.
  for (const tier of TIERS) {
    const from = resolve(outDir, tier);
    const to = resolve(
      repoRoot,
      "packages/ui-contract/goldens",
      tier,
      "__screenshots__/react",
    );
    if (existsSync(from)) {
      mkdirSync(to, { recursive: true });
      cpSync(from, to, { recursive: true });
    }
  }
  rmSync(outDir, { recursive: true, force: true });
  console.log(
    "[goldens] regenerated the canonical react/ set into the working tree — review and commit.",
  );
}
