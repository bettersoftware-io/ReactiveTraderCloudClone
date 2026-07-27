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

import { classifyBrowserTeardown } from "./teardownPolicy";
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

// Teardown judges the RESOURCE, not the clock. `browser.close()` not returning
// in time is a proxy; what actually matters is whether this worker still holds a
// live browser, and the two come apart — so each is handled on its own terms
// below rather than collapsed into one "slow shutdown" warning.
//
// Measured baseline: with every e2e suite running at once (12-core box, 7 suites
// via run-all.ts, ~7 Chromiums), `close()` settles in 27–325 ms and
// `browser.contexts()` is already empty because the After hook closes each
// scenario's context. The budget is ~60x that worst case, so exceeding it means
// something is genuinely wrong rather than that we were impatient.
const TEARDOWN_BUDGET_MS = 20_000;

AfterAll({ timeout: 60_000 }, async () => {
  await closeBrowserOrReportLeak();
  // Usually already a no-op: with-server.ts starts one shared dev server and
  // flags it via RTC_DEV_SERVER_SHARED, so each cucumber worker's
  // startDevServer() adopts it and returns a no-op stop(). It only does real
  // work when this suite is run directly, without that wrapper — and makeStop()
  // escalates to SIGKILL on its own after 5 s, so the budget here is a backstop
  // for a process that ignores even that.
  await stopDevServerWithinBudget();
});

async function closeBrowserOrReportLeak(): Promise<void> {
  const target = browser;

  if (!target) {
    return;
  }

  // Ask the browser itself whether it is actually gone, rather than inferring
  // from the clock. classifyBrowserTeardown owns the policy (and its tests).
  const verdict = classifyBrowserTeardown({
    failure: await settleWithinBudget(target.close()),
    stillConnected: target.isConnected(),
  });

  if (verdict.kind === "clean") {
    return;
  }

  if (verdict.kind === "leaked") {
    throw new Error(`[playwright-cucumber] teardown: ${verdict.reason}`);
  }

  process.stderr.write(`[playwright-cucumber] teardown: ${verdict.reason}\n`);
}

async function stopDevServerWithinBudget(): Promise<void> {
  if (!dev) {
    return;
  }

  const failure = await settleWithinBudget(dev.stop());

  if (failure) {
    process.stderr.write(
      `[playwright-cucumber] teardown: dev server stop() ${failure} — the ` +
        `server may still hold its port.\n`,
    );
  }
}

/** Describes how `work` failed, or null when it completed cleanly in time. */
async function settleWithinBudget(work: Promise<void>): Promise<string | null> {
  // Absorb the rejection HERE rather than in a race arm. A shutdown that rejects
  // after the budget expired would otherwise be a promise rejecting with no
  // handler attached — an unhandled rejection, fatal by default in modern Node,
  // and a worse outcome than anything this function guards against.
  const settled = work.then(
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
    return await Promise.race([settled, budgetExpired]);
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
