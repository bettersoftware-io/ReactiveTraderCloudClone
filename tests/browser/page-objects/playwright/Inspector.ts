import { expect, type Page } from "@playwright/test";

import type { InspectorPO } from "../contracts/Inspector";
import { TESTIDS } from "../contracts/testids";

/**
 * Playwright impl of {@link InspectorPO}. Constructed with the PRIMARY app page;
 * `open()` spawns the inspector as a second page in that same browser context
 * (same origin ⇒ the devtools BroadcastChannel pairs with the app-side hub).
 * All locators target the second page, so the scenario/spec layers never see a
 * raw `page` handle.
 */
export class PlaywrightInspector implements InspectorPO {
  private inspectorPage: Page | undefined;

  constructor(private readonly appPage: Page) {}

  private page(): Page {
    if (this.inspectorPage === undefined) {
      throw new Error("inspector not opened; call open() first");
    }

    return this.inspectorPage;
  }

  async open(): Promise<void> {
    const page = await this.appPage.context().newPage();
    await page.goto("/devtools/");
    this.inspectorPage = page;
  }

  async waitConnectionBadge(
    expected: string,
    timeoutMs: number,
  ): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.devtools.connectionBadge),
    ).toHaveText(expected, { timeout: timeoutMs });
  }

  async waitStreamRow(streamId: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page()
        .getByTestId(TESTIDS.devtools.streamRow)
        .filter({ hasText: streamId }),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async openMachinesLens(timeoutMs: number): Promise<void> {
    await this.page()
      .getByTestId(TESTIDS.devtools.lensMachines)
      .click({ timeout: timeoutMs });
  }

  async waitMachineRowOfKind(kind: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page()
        .getByTestId(TESTIDS.devtools.machineRow)
        .filter({ hasText: kind })
        .first(),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async pinLatestTimelineRow(timeoutMs: number): Promise<void> {
    // ArrowUp from follow mode pins the tail row atomically in state — no
    // element to click, so nothing to race the ~15 Hz repaint/auto-scroll.
    // Guard: the shortcut is a no-op on an empty timeline, so first wait for
    // a row to exist (attachment only — no stability/viewport requirement).
    await this.page()
      .getByTestId(TESTIDS.devtools.timelineRow)
      .first()
      .waitFor({ state: "attached", timeout: timeoutMs });
    await this.page().keyboard.press("ArrowUp");
  }

  async waitPinnedBar(timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.devtools.pinnedBar),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async waitNoPinnedBar(timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.devtools.pinnedBar),
    ).toBeHidden({ timeout: timeoutMs });
  }

  async resumeViaEscape(): Promise<void> {
    await this.page().keyboard.press("Escape");
  }

  async closeAppPage(): Promise<void> {
    await this.appPage.close();
  }
}
