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

/** A showPanel/restylePanel turn's `panel` wire event lands well before its
 * (typed-reveal-paced) chat reply finishes — no speech pacing involved —
 * but generous to absorb CI jitter. */
const PANEL_LIVE_TIMEOUT_MS = 15_000;

/** The body renderer mounts one tick after the panel goes live (its own
 * `data$` subscription), and a restyle remounts it (keyed by `viz.kind`) —
 * generous for the same reason as the other polls in this file. */
const PANEL_RENDERER_TIMEOUT_MS = 15_000;

/** Dismiss plays a short exit animation (~180ms, skipped under freeze/
 * reduced-motion) before the underlying intent fires — generous for CI. */
const PANEL_DISMISS_TIMEOUT_MS = 15_000;

export class PlaywrightJarvis implements JarvisPO {
  constructor(private readonly page: Page) {}

  private orb(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.orb);
  }

  private overlay(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.overlay);
  }

  private closeButton(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.close);
  }

  private input(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.input);
  }

  private sendButton(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.send);
  }

  /** The panel layer mounts as the overlay's SIBLING (JarvisPanelLayer), so
   * it stays queryable whether the overlay is open or closed. */
  private panelLayer(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.panelLayer);
  }

  private panel(panelId: string): Locator {
    return this.page.locator(
      `[data-testid="${TESTIDS.jarvis.panel}"][data-panel-id="${panelId}"]`,
    );
  }

  private panelLine(panelId: string): Locator {
    return this.panel(panelId).getByTestId(TESTIDS.jarvis.panelLine);
  }

  private panelHeatmap(panelId: string): Locator {
    return this.panel(panelId).getByTestId(TESTIDS.jarvis.panelHeatmap);
  }

  private panelDismiss(panelId: string): Locator {
    return this.panel(panelId).getByTestId(TESTIDS.jarvis.panelDismiss);
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

  async closeViaButton(): Promise<void> {
    await this.closeButton().click();
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

  async waitForPanelLive(panelId: string): Promise<void> {
    await expect(this.panel(panelId)).toHaveAttribute("data-status", "live", {
      timeout: PANEL_LIVE_TIMEOUT_MS,
    });
  }

  async isPanelPresent(panelId: string): Promise<boolean> {
    return (await this.panel(panelId).count()) > 0;
  }

  async waitForPanelLineRenderer(panelId: string): Promise<void> {
    await expect(this.panelLine(panelId)).toBeVisible({
      timeout: PANEL_RENDERER_TIMEOUT_MS,
    });
  }

  async waitForPanelHeatmapRenderer(panelId: string): Promise<void> {
    await expect(this.panelHeatmap(panelId)).toBeVisible({
      timeout: PANEL_RENDERER_TIMEOUT_MS,
    });
    // The line renderer must be GONE, not merely hidden — a restyle remounts
    // the body keyed by `viz.kind` (see JarvisPanelLayer's `key={data?.kind}`),
    // so the two renderers never coexist in the DOM.
    await expect(this.panelLine(panelId)).toHaveCount(0);
  }

  async dismissPanel(panelId: string): Promise<void> {
    await this.panelDismiss(panelId).click();
  }

  async waitForNoPanels(): Promise<void> {
    await expect(this.panelLayer()).toHaveCount(0, {
      timeout: PANEL_DISMISS_TIMEOUT_MS,
    });
  }
}
