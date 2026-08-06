import type { Page } from "@playwright/test";

import {
  JARVIS_NARRATOR_ON_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "#/browser/authSeed";

import { TESTIDS } from "../contracts/testids";
import type { WorkspacePO } from "../contracts/Workspace";

export class PlaywrightWorkspace implements WorkspacePO {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/");
  }

  async openFx(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("fx")).click();
  }

  async openCredit(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("credit")).click();
  }

  async openAdmin(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("admin")).click();
  }

  async openEquities(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("equities")).click();
  }

  async openWithNarratorThresholds(): Promise<void> {
    // The shared bootstrap (playwright-cucumber/world.ts or
    // playwright/_context.ts, whichever runner drives this scenario) seeds
    // JarvisNarrator OFF by default for hermeticity — see authSeed.ts. This
    // is the one ride that actually exercises narration, so opt back IN for
    // this page's own init-script chain: addInitScript callbacks run in
    // registration order on every navigation, so this one registers after
    // the shared OFF seed and wins on the goto() below (and any later
    // navigation in this context).
    await this.page.addInitScript(seedLocalStorageItem, {
      key: JARVIS_NARRATOR_STORAGE_KEY,
      value: JARVIS_NARRATOR_ON_VALUE,
    });
    await this.page.goto("/?narratorThresholds=test");
  }

  async clickTab(tab: "fx" | "credit" | "admin" | "equities"): Promise<void> {
    await this.page.getByTestId(TESTIDS.shell.tab(tab)).click();
  }

  async isTabActive(
    tab: "fx" | "credit" | "admin" | "equities",
  ): Promise<boolean> {
    return (
      (await this.page
        .getByTestId(TESTIDS.shell.tab(tab))
        .getAttribute("data-active")) === "true"
    );
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async setOffline(offline: boolean): Promise<void> {
    await this.page.context().setOffline(offline);
  }

  async rootBackgroundColor(): Promise<string> {
    return await this.page.locator("#root > div").evaluate((el) => {
      return getComputedStyle(el as HTMLElement).backgroundColor;
    });
  }

  async clickTestId(id: string): Promise<void> {
    await this.page.getByTestId(id).click();
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}
