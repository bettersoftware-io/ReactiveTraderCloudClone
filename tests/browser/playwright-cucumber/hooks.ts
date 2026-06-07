import { After, AfterAll, Before, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";
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

After(async function (this: PlaywrightWorld) {
  await this.close();
});
