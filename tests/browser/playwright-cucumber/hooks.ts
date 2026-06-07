import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startDevServer, type DevServerHandle } from "../../scripts/devServer";
import { PlaywrightWorld } from "./world";

// Extend the step timeout to 30 s so that multi-step scenarios (e.g. buy
// N times with confirmation dismissals) have room to finish under Playwright.
setDefaultTimeout(30_000);

let browser: Browser | undefined;
let dev: DevServerHandle | undefined;

BeforeAll({ timeout: 60_000 }, async () => {
  dev = await startDevServer();
  browser = await chromium.launch();
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
