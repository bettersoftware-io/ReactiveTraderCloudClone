import type { Page } from "@playwright/test";
import type { WorkspacePO } from "../contracts/Workspace";
import { TESTIDS } from "../contracts/testids";

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
  async clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    await this.page.getByTestId(TESTIDS.shell.tab(tab)).click();
  }
  async reload(): Promise<void> {
    await this.page.reload();
  }
  async setOffline(offline: boolean): Promise<void> {
    await this.page.context().setOffline(offline);
  }
  async rootBackgroundColor(): Promise<string> {
    return await this.page.locator("#root > div").evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
  }
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}
