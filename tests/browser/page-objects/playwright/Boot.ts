import { expect, type Page } from "@playwright/test";

import { seedLocalStorageItem } from "#/browser/authSeed";

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
    // Distinguish "seed false" from "leave unseeded": an empty store now
    // falls back to DEFAULT_FORCE_BOOT_ANIMATION (true), so proving the
    // reduced-motion-not-forced case requires writing the literal string
    // "false", not merely skipping the write.
    if (options?.forceAnimation !== undefined) {
      await this.page.addInitScript(seedLocalStorageItem, {
        key: FORCE_BOOT_ANIMATION_KEY,
        value: options.forceAnimation ? "true" : "false",
      });
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
