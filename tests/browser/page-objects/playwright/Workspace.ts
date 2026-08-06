import type { Page } from "@playwright/test";

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
