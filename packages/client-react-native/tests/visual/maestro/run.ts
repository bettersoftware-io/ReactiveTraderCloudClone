import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, cwd, env, exit } from "node:process";
import { promisify } from "node:util";

import { SCENARIO_IDS } from "../scenarioIds";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";

const exec = promisify(execFile);

/**
 * Tier 2 CLI runner: runs the generated Maestro flows (which screenshot each
 * scenario), then diffs each shot against its committed `maestro` golden using
 * the shared `pixelmatch` core. Mac-local only, never CI.
 *
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update
 *
 * Env: `MAESTRO_METRO_PORT` (default `8083`, substituted into the flow's
 * dev-client link), `RTC_VISUAL_MAESTRO_SHOTS` (Maestro's screenshot output
 * dir, default `<cwd>/.maestro-shots`).
 */
const FLOWS_DIR = "tests/visual/maestro/flows";
const SHOTS = env.RTC_VISUAL_MAESTRO_SHOTS ?? join(cwd(), ".maestro-shots");

async function main(): Promise<void> {
  const update = argv.includes("--update");
  await exec("maestro", ["test", FLOWS_DIR, "--format", "junit"], {
    env: {
      ...env,
      MAESTRO_CLI_NO_ANALYTICS: "1",
      MAESTRO_METRO_PORT: env.MAESTRO_METRO_PORT ?? "8083",
    },
  });

  let failures = 0;

  for (const id of SCENARIO_IDS) {
    const shot = join(SHOTS, `${id.replace(/\//g, "_")}.png`);
    const png = await readFile(shot);
    const gp = goldenPath("maestro", id);

    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${id}`);
      continue;
    }

    const result = await compareToGolden(png, gp);
    if (result.pass) {
      console.log(`pass     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    } else {
      failures += 1;
      console.error(`FAIL     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed`);
    exit(1);
  }
  exit(0);
}

main().catch((e: unknown): void => {
  console.error("maestro visual run failed:", e);
  exit(1);
});
