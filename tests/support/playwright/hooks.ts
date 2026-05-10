import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startDevServer, type DevServerHandle } from "../devServer";
import { PlaywrightWorld } from "./world";

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
