import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  Status,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import { type Browser, chromium } from "@playwright/test";
import { type DevServerHandle, startDevServer } from "../../scripts/devServer";
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

AfterAll(async () => {
  await browser?.close();
  await dev?.stop();
});

Before(async function (this: PlaywrightWorld) {
  if (!browser) throw new Error("browser not initialised in BeforeAll");
  await this.open(browser);
});

After(async function (this: PlaywrightWorld, { result }) {
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
