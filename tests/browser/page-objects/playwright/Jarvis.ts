import { expect, type Locator, type Page } from "@playwright/test";

import type { JarvisPO } from "../contracts/Jarvis";
import { TESTIDS } from "../contracts/testids";

/** The typed reveal paces out at SPEECH_CHUNK_INTERVAL_MS per chunk (see
 * @rtc/motion-core), so a multi-sentence reply can take a few real seconds
 * to finish streaming — generous on purpose. */
const REPLY_DONE_TIMEOUT_MS = 15_000;

/** The confirm card appears after an async price snapshot read (no speech
 * pacing involved) — normally fast, but generous to absorb CI jitter. */
const CONFIRM_CARD_TIMEOUT_MS = 15_000;

export class PlaywrightJarvis implements JarvisPO {
  constructor(private readonly page: Page) {}

  private orb(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.orb);
  }

  private overlay(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.overlay);
  }

  private input(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.input);
  }

  private sendButton(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.send);
  }

  /** Every message row (user and jarvis) shares this testid — filter by the
   * `data-role` attribute rather than a separate testid per role. */
  private jarvisEntries(): Locator {
    return this.page.locator(
      `[data-testid="${TESTIDS.jarvis.entry}"][data-role="jarvis"]`,
    );
  }

  private lastJarvisEntry(): Locator {
    return this.jarvisEntries().last();
  }

  private confirmCard(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.confirmCard);
  }

  private confirmApprove(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.confirmApprove);
  }

  async openViaOrb(): Promise<void> {
    await this.orb().click();
  }

  async isOverlayVisible(): Promise<boolean> {
    return await this.overlay().isVisible();
  }

  async ask(text: string): Promise<void> {
    await this.input().fill(text);
    await this.sendButton().click();
  }

  async lastReplyText(): Promise<string> {
    return (await this.lastJarvisEntry().innerText()) ?? "";
  }

  async waitForReplyDone(): Promise<void> {
    await expect(this.lastJarvisEntry()).toHaveAttribute("data-done", "true", {
      timeout: REPLY_DONE_TIMEOUT_MS,
    });
  }

  async isConfirmCardVisible(): Promise<boolean> {
    return await this.confirmCard().isVisible();
  }

  async approveConfirmation(): Promise<void> {
    // The card only mounts once the scripted brain's async price-snapshot
    // read resolves — wait for it explicitly rather than relying solely on
    // click()'s actionability retry, so a missing card fails with a clear
    // "not visible" timeout instead of a generic click timeout.
    await expect(this.confirmCard()).toBeVisible({
      timeout: CONFIRM_CARD_TIMEOUT_MS,
    });
    await this.confirmApprove().click();
  }
}
