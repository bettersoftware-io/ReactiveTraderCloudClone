#!/usr/bin/env tsx
/**
 * Motion audit — the repeatable performance assessment behind /rtc:perf-audit.
 *
 * Drives a running web client through every workspace view at each requested
 * power-saver level and reports, per view, what motion machinery is actually
 * live: non-`finished` animations from `document.getAnimations()` (CSS
 * animations, CSS transitions AND WAAPI, with timing + target identity) and
 * `requestAnimationFrame` registrations. This is the instrument that found
 * freeze's churn leaks — manufactured per-tick CSSTransitions, retriggered
 * flash keyframes, resident paused loops — none of which any pixel, jsdom or
 * computed-style tier can see.
 *
 * Levels:
 *  - `off`   — inventory only: the full expected animation roster.
 *  - `calm`  — inventory only: loops should be paused, data feedback stays.
 *  - `freeze`— ASSERTED: zero live animations and zero rAF activity. Any leak
 *              is listed and the process exits 1.
 *
 * Usage (normally via the root scripts, which start the dev server for you):
 *   pnpm perf:motion-audit           # react client
 *   pnpm perf:motion-audit:solid     # solid client
 * Direct, against an already-running client:
 *   pnpm --filter @rtc/tests exec tsx scripts/motion-audit.ts --url http://localhost:5173
 * Options: --levels off,calm,freeze  --seconds <sampling window per view>
 */
import process from "node:process";

import { chromium } from "@playwright/test";

import {
  E2E_SESSION_JSON,
  E2E_SESSION_KEY,
  seedLocalStorageItem,
} from "../browser/authSeed";
import { type MotionSample, sampleMotion } from "../browser/motionProbe";

const VIEWS = ["fx", "credit", "equities", "admin"] as const;
const ALL_LEVELS = ["off", "calm", "freeze"] as const;

type Level = (typeof ALL_LEVELS)[number];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const context = await browser.newContext();
  // Same authenticated-session seed the e2e suites use — boots straight past
  // LoginScreen in simulator mode (see tests/browser/authSeed.ts).
  await context.addInitScript(seedLocalStorageItem, {
    key: E2E_SESSION_KEY,
    value: E2E_SESSION_JSON,
  });
  // tsx's esbuild transform (keepNames) wraps the inner functions of
  // `sampleMotion` in `__name(...)` helper calls, and Playwright serialises
  // that transformed source into the page — where esbuild's helper does not
  // exist. Provide a pass-through so the serialised probe runs. (`playwright
  // test` uses its own transform and does not need this; it is tsx-only.)
  await context.addInitScript(() => {
    const g = globalThis as EsbuildHelperGlobal;

    g.__name ??= (target: unknown): unknown => {
      return target;
    };
  });
  const page = await context.newPage();
  let freezeLeaks = 0;

  try {
    for (const level of args.levels) {
      // Seed the preference BEFORE the app composes, then reload so the boot
      // path also runs at this level (same key LocalStoragePreferencesAdapter
      // reads).
      await page.goto(args.url);
      await page.evaluate((lvl) => {
        localStorage.setItem("rtc-power-saver", lvl);
      }, level);
      await page.goto(args.url);
      await page
        .getByTestId("tab-fx")
        .waitFor({ state: "visible", timeout: 30_000 });

      console.log(`\n=== level: ${level} ===`);

      for (const view of VIEWS) {
        await page.getByTestId(`tab-${view}`).click();
        // Let the view mount and its entry choreography settle so steady-state
        // churn — not one-off mount animations — is what gets sampled.
        await page.waitForTimeout(1000);

        const sample = (await page.evaluate(sampleMotion, {
          samples: Math.max(2, Math.round((args.seconds * 1000) / 250)),
          intervalMs: 250,
        })) as MotionSample;

        report(view, sample);

        if (level === "freeze") {
          freezeLeaks += sample.liveAnimations.length;
          freezeLeaks += sample.rafCallbacks > 0 ? 1 : 0;
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (freezeLeaks > 0) {
    console.error(
      `\nFAIL: ${freezeLeaks} motion leak(s) under freeze — see the freeze section above.`,
    );
    process.exit(1);
  }

  if (args.levels.includes("freeze")) {
    console.log("\nOK: freeze is motion-free on every view.");
  }
}

function report(view: string, sample: MotionSample): void {
  const rafPerSecond =
    sample.elapsedMs > 0
      ? Math.round((sample.rafCallbacks / sample.elapsedMs) * 1000)
      : 0;
  console.log(
    `-- ${view}: rAF ${rafPerSecond}/s, live animations ${sample.liveAnimations.length}`,
  );

  for (const animation of sample.liveAnimations) {
    console.log(`     ${animation}`);
  }
}

/** esbuild's keepNames helper slot — see the `addInitScript` shim above. */
interface EsbuildHelperGlobal {
  __name?: (target: unknown, name: string) => unknown;
}

interface AuditArgs {
  readonly url: string;
  readonly levels: readonly Level[];
  readonly seconds: number;
}

function parseArgs(argv: readonly string[]): AuditArgs {
  let url = process.env.RTC_DEV_PORT
    ? `http://localhost:${process.env.RTC_DEV_PORT}`
    : "";
  let levels: readonly Level[] = ALL_LEVELS;
  let seconds = 4;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === "--") {
      // pnpm forwards the `run script -- --flag` separator verbatim, so the
      // documented forwarding recipe delivers a literal "--" ahead of the
      // real flags.
    } else if (arg === "--url" && value !== undefined) {
      url = value;
      i += 1;
    } else if (arg === "--levels" && value !== undefined) {
      levels = value.split(",").map((raw) => {
        const trimmed = raw.trim();

        if (!ALL_LEVELS.includes(trimmed as Level)) {
          throw new Error(`unknown level "${trimmed}" (use off, calm, freeze)`);
        }

        return trimmed as Level;
      });
      i += 1;
    } else if (arg === "--seconds" && value !== undefined) {
      seconds = Number.parseFloat(value);
      i += 1;
    } else {
      throw new Error(
        `unknown argument "${arg}" (use --url, --levels, --seconds)`,
      );
    }
  }

  if (url === "") {
    throw new Error(
      "no target: pass --url or run via with-server (RTC_DEV_PORT)",
    );
  }

  return { url, levels, seconds };
}

await main();
