import { expect, type Page } from "@playwright/test";

import type { BootOpenOptions, BootPO } from "../contracts/Boot";
import { TESTIDS } from "../contracts/testids";

/**
 * The preference's localStorage key, mirrored verbatim from
 * `FORCE_BOOT_ANIMATION_STORAGE_KEY`
 * (packages/client-{react,solid}/src/app/adapters/LocalStoragePreferencesAdapter.ts).
 * Not imported from either package: the tests package has no dependency edge
 * onto client-solid, and importing only from client-react would falsely
 * privilege one client's copy of a value both must agree on byte-for-byte.
 */
const FORCE_BOOT_ANIMATION_KEY = "rtc-force-boot-animation";

export class PlaywrightBoot implements BootPO {
  constructor(private readonly page: Page) {}

  async open(options?: BootOpenOptions): Promise<void> {
    if (options?.forceAnimation) {
      await this.page.addInitScript((key: string) => {
        window.localStorage.setItem(key, "true");
      }, FORCE_BOOT_ANIMATION_KEY);
    }

    // ?splash forces shouldPlayBootSplash() ON even though Playwright sets
    // navigator.webdriver (bootSplashGate.ts's force-on override) — without
    // it, BootGate never mounts BootSequence at all under automation.
    await this.page.goto("/?splash");
  }

  async waitForceAnimAttr(
    expected: "true" | "false",
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.boot.sequence)).toHaveAttribute(
      "data-force-anim",
      expected,
      { timeout: timeoutMs },
    );
  }

  async waitCanvasVisible(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByTestId(TESTIDS.boot.sequence).locator("canvas"),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async waitCanvasHidden(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByTestId(TESTIDS.boot.sequence).locator("canvas"),
    ).toHaveCSS("display", "none", { timeout: timeoutMs });
  }
}
