// Drives the frozen mobile-v1 prototype and writes the deviation corpus's PNGs.
//
// Run against a served prototype:
//   pnpm dev:design:mobile &
//   pnpm prototype-shots:capture --out /tmp/proto-scratch
//
// Captures go to a SCRATCH directory and are promoted by copying reviewed
// bytes. Never point --out at the committed tree directly: that commits pixels
// nobody looked at, which is how the app side's --update-snapshots default-mode
// bug once shipped a golden no human had seen.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { type Browser, chromium, type Locator, type Page } from "playwright";

import { SHOTS, type Shot, type ShotStep } from "./shots";

const PROTOTYPE_URL = "http://localhost:8899/";

/** The instant every boot golden is pinned to, matching the app side's
 * BOOT_SCENE_ELAPSED_SEC (packages/client-react-native/tests/visual/fixtures.tsx).
 * Both sides must sample the same frame or every difference is noise. */
export const BOOT_INSTANT_SEC = 2.52;

/** The BROWSER WINDOW — deliberately much larger than the phone.
 *
 * MEASURED 2026-08-02: at a 402px-wide viewport the page squeezes the
 * simulated phone and `[data-theme-root]` renders 354x874, yielding 1062x2622
 * PNGs that silently fail to match their app twins. At 600px and above the
 * frame reaches its natural 402x874 and the element screenshot is exactly
 * 1206x2622. The phone is the ELEMENT, not the window. */
const CAPTURE_VIEWPORT = { width: 900, height: 1100 } as const;

/** 402x874 logical x3 = 1206x2622, the app goldens' exact dimensions. */
const DEVICE_SCALE_FACTOR = 3;

/** Longest boot is 5600ms (dc.html:1036); allow margin. */
const BOOT_COMPLETE_MS = 7000;

/** Transitions in the prototype are ~200ms; settle past them before shooting. */
const SETTLE_MS = 500;

/** Pause BETWEEN steps (never after the last one).
 *
 * Without it a multi-step shot races its own transitions: tapping a spot tile
 * starts the trade sheet's ~300ms entry animation, and an immediate
 * `getByText("BUY")` can resolve against a DOM that does not contain the
 * sheet's button yet, silently matching a tile's BUY price label instead. That
 * produced a filmstrip whose third frame showed a ready ticket between two
 * frames of the ceremony it was supposed to be sampling. Not applied after the
 * final step, so a filmstrip's instants stay measured from the trigger. */
const INTER_STEP_MS = 400;

/** Hold the page until the prototype's boot animation reaches `seconds`.
 *
 * The boot loop runs on requestAnimationFrame against performance.now()
 * (dc.html:1032), which page.clock does NOT control — so this waits on the
 * prototype's own clock rather than trying to drive it. `performance.now()` is
 * measured from navigation start, while the prototype starts its boot a little
 * later at mount, so the scene lands marginally BEFORE `seconds`. That skew is
 * accepted: the corpus is never compared against itself (spec rule (b)), so the
 * requirement is "t ~= 2.5s, not t = 0.3s", not frame-exactness.
 *
 * Written as `waitForFunction` with a SINGLE expression rather than an
 * `evaluate` containing a rAF recursion: esbuild's keepNames transform wraps
 * inner function declarations in a `__name()` helper that does not exist in the
 * page context, so a nested `const tick = () => …` fails at runtime with
 * "__name is not defined". `polling: "raf"` gives the same frame cadence with
 * nothing to wrap. */
export async function waitForBootInstant(
  page: Page,
  seconds: number,
): Promise<void> {
  await page.waitForFunction(
    (ms: number) => {
      return performance.now() >= ms;
    },
    seconds * 1000,
    { polling: "raf" },
  );
}

async function runStep(page: Page, step: ShotStep): Promise<void> {
  if ("tapText" in step) {
    // Substring by DEFAULT because the dock satellites render glyph + label in
    // one button ("⇅\n RATES"), which an exact match would miss. Opt into
    // `exact` wherever a shorter label is a substring of a longer one.
    await page
      .getByText(step.tapText, { exact: step.exact ?? false })
      .first()
      .click();
  } else if ("tapSelector" in step) {
    await page.locator(step.tapSelector).first().click();
  } else {
    await page.locator(step.holdSelector).first().hover();
    await page.mouse.down();
    await page.waitForTimeout(step.ms);
    // Deliberately NOT released: the ring must be captured mid-fill, which is
    // the whole point of the app's LOCK_HOLD_PROGRESS 0.55.
  }
}

/** Throws unless the shot's arrival assertion is satisfied. Positive assertion
 * only — never "the error screen isn't showing". The app harness learned this
 * twice (T2: screenshotted the Expo launcher and called it a regression;
 * T7: every scenario after the first drove a dead app). */
async function assertArrived(page: Page, shot: Shot): Promise<void> {
  const { text, selector, storage } = shot.arrival;

  function fail(why: string): never {
    throw new Error(`${shot.id}: never arrived — ${why}. No PNG written.`);
  }

  if (text !== undefined) {
    try {
      await page
        .getByText(text)
        .first()
        .waitFor({ state: "visible", timeout: 5000 });
    } catch {
      fail(`expected text ${JSON.stringify(text)} was not visible`);
    }
  }

  if (selector !== undefined) {
    try {
      await page
        .locator(selector)
        .first()
        .waitFor({ state: "attached", timeout: 5000 });
    } catch {
      fail(`expected selector ${JSON.stringify(selector)} was not present`);
    }
  }

  if (storage !== undefined) {
    const [key, want] = storage;
    const got = await page.evaluate((k: string) => {
      return localStorage.getItem(k);
    }, key);

    if (got !== want) {
      fail(
        `localStorage[${JSON.stringify(key)}] is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
      );
    }
  }

  if (text === undefined && selector === undefined && storage === undefined) {
    fail("the manifest entry declares no arrival assertion at all");
  }
}

async function openShot(browser: Browser, shot: Shot): Promise<Page> {
  const context = await browser.newContext({
    viewport: CAPTURE_VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  // Seed BEFORE first load: the prototype reads rtm_theme/rtm_mode/rtm_bootSeq
  // during construction (dc.html:690, :702, :1032).
  await context.addInitScript(
    (seed: Record<string, string>) => {
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, value);
      }
    },
    shot.seed as Record<string, string>,
  );

  const page = await context.newPage();
  await page.goto(PROTOTYPE_URL, { waitUntil: "domcontentloaded" });

  return page;
}

/** The app content root inside the simulated bezel — measured at exactly
 * 402x874, so at dSF 3 it yields the app goldens' 1206x2622 with no
 * rounded-corner artifacts and no bezel.
 *
 * Known, expected difference from the app side, NOT drift: the simulated
 * dynamic island and home indicator are SIBLINGS of this element (drawn by the
 * frame at device-frames.jsx:218/:237), so they are excluded here, whereas the
 * app's simctl capture includes the REAL island and status bar. That is
 * hardware standing in for hardware; the design content is what is compared. */
function screenOf(page: Page): Locator {
  return page.locator("[data-theme-root]").first();
}

/** Open a fresh context and drive it to the shot's state, arrival asserted.
 *
 * Exported because the filmstrip builder needs exactly this and must not
 * duplicate it: a second copy of the boot wait and the step replay would drift
 * from this one silently, and the filmstrips would stop showing what the stills
 * show. The CALLER owns closing `page.context()`. */
export async function driveToShot(
  browser: Browser,
  shot: Shot,
  opts: { readonly skipSettle?: boolean } = {},
): Promise<Page> {
  const page = await openShot(browser, shot);

  if (shot.afterBoot) {
    await page.waitForTimeout(BOOT_COMPLETE_MS);

    for (const [index, step] of shot.steps.entries()) {
      await runStep(page, step);

      if (index < shot.steps.length - 1) {
        await page.waitForTimeout(INTER_STEP_MS);
      }
    }

    // No settle after a HOLD. Settling assumes a transition converging to rest,
    // but a hold is a live interaction still running under a pressed pointer —
    // extra time is a DIFFERENT state, not a calmer one. A 500ms settle turned
    // a measured 208ms hold (ring at 0.55) into 708ms, which completes the
    // unlock and leaves the lock screen entirely.
    const last = shot.steps.at(-1);

    // Filmstrips skip the settle too, for a different reason: their sample
    // instants are measured from the TRIGGER, and a fixed 500ms pause would
    // shift every frame of a ceremony that only lasts ~2s.
    const settle =
      opts.skipSettle !== true &&
      (last === undefined || !("holdSelector" in last));

    if (settle) {
      await page.waitForTimeout(SETTLE_MS);
    }
  } else {
    await waitForBootInstant(page, BOOT_INSTANT_SEC);
  }

  await assertArrived(page, shot);

  return page;
}

export async function captureShot(
  browser: Browser,
  shot: Shot,
  outDir: string,
): Promise<string> {
  const page = await driveToShot(browser, shot);

  const file = join(outDir, `${shot.id}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await screenOf(page).screenshot({ path: file });
  await page.context().close();

  return file;
}

/** What a capture run needs: an output directory, and optionally a single shot
 * id to re-shoot rather than the whole set. */
export type CaptureOptions = {
  readonly only?: string;
  readonly outDir: string;
};

export async function capture(opts: CaptureOptions): Promise<void> {
  const stills = SHOTS.filter((shot) => {
    return shot.filmstrip === undefined;
  });

  const wanted =
    opts.only === undefined
      ? stills
      : stills.filter((shot) => {
          return shot.id === opts.only;
        });

  if (wanted.length === 0) {
    throw new Error(`no still shot matches ${JSON.stringify(opts.only)}`);
  }

  const browser = await chromium.launch();

  try {
    for (const shot of wanted) {
      const file = await captureShot(browser, shot, opts.outDir);
      console.log(`captured ${shot.id} → ${file}`);
    }
  } finally {
    await browser.close();
  }
}

/** Read `--flag value` out of argv, or undefined. */
export function argOf(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);

  return at === -1 ? undefined : process.argv[at + 1];
}

// `main().catch(...)` rather than top-level await, matching
// scripts/jarvis-live-smoke.ts: the root package has no `"type": "module"`, so
// tsx transforms these to CJS, where top-level await is a build error.
if (process.argv[1]?.endsWith("capture.ts")) {
  capture({
    only: argOf("--only"),
    outDir: argOf("--out") ?? "docs/design/mobile/v1/reference-shots",
  }).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
