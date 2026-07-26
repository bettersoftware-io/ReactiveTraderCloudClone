import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  Status,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import { type Browser, chromium } from "@playwright/test";

import { type DevServerHandle, startDevServer } from "#/scripts/devServer";

import type { PlaywrightWorld } from "./world";

// Extend the step timeout to 30 s so that multi-step scenarios (e.g. buy
// N times with confirmation dismissals) have room to finish under Playwright.
setDefaultTimeout(30_000);

let browser: Browser | undefined;
let dev: DevServerHandle | undefined;

BeforeAll({ timeout: 60_000 }, async () => {
  dev = await startDevServer();
  // PWCUCUMBER_HEADED (set by the :headed script) launches a visible browser
  // with slowMo so the scenario can be watched live. cucumber-js has no UI
  // mode, so a headed browser is the real-time view.
  browser = await chromium.launch(
    process.env.PWCUCUMBER_HEADED ? { headless: false, slowMo: 250 } : {},
  );
});

// Teardown is best-effort, and deliberately cannot fail the run. By the time it
// runs every scenario has already reported its own result, so a slow shutdown
// here says nothing about whether the suite passed — yet cucumber counts a
// failed hook as a failed run, and hooks are not covered by `retry`. That is
// exactly how this suite once went red with all 47 scenarios green: under the
// parallel-suite load of run-all.ts, `browser.close()` (which waits for the
// Chromium process to exit) overran the 30 s default hook timeout in both
// workers. The budget below is well under the explicit 60 s so a stall is
// reported as a warning rather than surfacing as a timeout.
const TEARDOWN_BUDGET_MS = 20_000;

AfterAll({ timeout: 60_000 }, async () => {
  await shutDownWithinBudget("browser.close()", browser?.close());
  // The dev server is usually already a no-op here: with-server.ts starts one
  // shared server and flags it via RTC_DEV_SERVER_SHARED, so each cucumber
  // worker's startDevServer() adopts it and returns a no-op stop(). It only
  // does real work when this suite is run directly, without that wrapper.
  await shutDownWithinBudget("dev server stop()", dev?.stop());
});

async function shutDownWithinBudget(
  what: string,
  shutdown: Promise<void> | undefined,
): Promise<void> {
  if (!shutdown) {
    return;
  }

  // Absorb the rejection HERE rather than in a race arm. A shutdown that
  // rejects after the budget has already expired would otherwise be a promise
  // that rejects with no handler attached — an unhandled rejection, which Node
  // treats as fatal by default and which would be a worse failure than the hook
  // timeout this function exists to prevent.
  const settled = shutdown.then(
    () => {
      return null;
    },
    (err: unknown) => {
      return `threw: ${String(err)}`;
    },
  );

  let budgetTimer: NodeJS.Timeout | undefined;
  const budgetExpired = new Promise<string>((resolve) => {
    budgetTimer = setTimeout(() => {
      return resolve(`did not return within ${TEARDOWN_BUDGET_MS}ms`);
    }, TEARDOWN_BUDGET_MS);
  });

  try {
    const failure = await Promise.race([settled, budgetExpired]);

    if (failure !== null) {
      process.stderr.write(
        `[playwright-cucumber] teardown: ${what} ${failure} — continuing so ` +
          `the run keeps the result its scenarios earned.\n`,
      );
    }
  } finally {
    clearTimeout(budgetTimer);
  }
}

Before(async function openWorld(this: PlaywrightWorld) {
  if (!browser) {
    throw new Error("browser not initialised in BeforeAll");
  }

  await this.open(browser);
});

After(async function closeWorld(this: PlaywrightWorld, { result }) {
  // On failure, embed a screenshot into the cucumber HTML report (image/png
  // attachments render inline under the failed scenario) before the page closes.
  if (result?.status === Status.FAILED && this.page) {
    try {
      await this.attach(
        await this.page.screenshot({ fullPage: true, timeout: 5_000 }),
        "image/png",
      );
    } catch {
      // Page gone (open() failed or browser crashed) or screenshot stalled —
      // skip the attach so the original failure stays visible and close() runs.
    }
  }

  await this.close();
});
