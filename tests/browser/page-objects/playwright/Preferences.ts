import { expect, type Page } from "@playwright/test";

import type {
  PreferencesPO,
  PrefsChartSubstrate,
} from "../contracts/Preferences";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightPreferences implements PreferencesPO {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.accountToggle).click();
    await this.page.getByTestId(TESTIDS.prefs.openTrigger).click();
  }

  async waitModalVisible(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.prefs.modal)).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async selectChartSubstrate(value: PrefsChartSubstrate): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.prefs.chartSubstrateSegment(value))
      .click();
  }

  async close(): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.done).click();
  }

  async waitModalHidden(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.prefs.modal)).toBeHidden({
      timeout: timeoutMs,
    });
  }
}
