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

/** The docked leaf (`InhouseLayoutEngine`'s `panel-<id>` section) mounts
 * synchronously off the same `dockedPanels` VM list `dockPanel`'s click
 * updates, and its body renderer one tick after that (own `data$`
 * subscription, same as the floating card) — generous for CI. */
const PANEL_DOCKED_LIVE_TIMEOUT_MS = 15_000;

/** `WorkspacePersistenceWriter` debounces the `rtc-workspace-layout-v1`
 * `localStorage` write by `WORKSPACE_PERSIST_DEBOUNCE_MS` (500ms —
 * `packages/client-core/src/layout/workspacePersistenceWriter.ts`) —
 * generous margin over that for CI jitter. Hardcoded here rather than
 * imported from a client package, same reasoning as `E2E_SESSION_KEY` in
 * `authSeed.ts`: the suite runs against either `@rtc/client-react` or
 * `@rtc/client-solid` via `RTC_CLIENT_PKG`, and both adapters export the
 * identical string. */
const WORKSPACE_LAYOUT_STORAGE_KEY = "rtc-workspace-layout-v1";
const WORKSPACE_LAYOUT_PERSIST_TIMEOUT_MS = 15_000;

/** With the `?narratorThresholds=test` seam's relaxed config
 * (`minWindowFill: 4`), the anomaly detector can evaluate as soon as 4 ticks
 * have arrived for one symbol (~150ms-1s each — see PricingSimulator's tick
 * interval) and the near-zero `spreadSigma`/`volSigma` thresholds make the
 * very first evaluation almost certain to cross — generous margin for CI
 * jitter and cold-start warmup, well past the handful of seconds this
 * normally takes. */
const NARRATION_FLARE_TIMEOUT_MS = 30_000;

/** JarvisDriverMachine stages each command's application `DRIVE_STAGGER_MS`
 * (350ms) apart, and the drive rows only fold in once the "command" event's
 * outcomes stream through `recordDriveOutcome` — generous for CI. */
const DRIVE_ROW_TIMEOUT_MS = 15_000;

/** `JarvisDemoMachine` beats `DEMO_STEP_BEAT_MS` (1200ms) between one step
 * settling and the next `sendScripted`, on top of that next step's own
 * typed-reveal-paced reply (a multi-sentence reply can run several real
 * seconds) — generous for CI. */
const DEMO_STEP_TIMEOUT_MS = 20_000;

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

  private panelDock(panelId: string): Locator {
    return this.panel(panelId).getByTestId(TESTIDS.jarvis.panelDock);
  }

  /** A DOCKED panel's own `InhouseLayoutEngine` leaf section — distinct from
   * `panel()` above, which locates the FLOATING card. */
  private dockedPanel(panelId: string): Locator {
    return this.page.getByTestId(TESTIDS.layout.panel(panelId));
  }

  private dockedPanelUndock(panelId: string): Locator {
    return this.dockedPanel(panelId).getByTestId(TESTIDS.jarvis.panelUndock);
  }

  private dockedPanelLine(panelId: string): Locator {
    return this.dockedPanel(panelId).getByTestId(TESTIDS.jarvis.panelLine);
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

  /** Every jarvis-role entry EXCLUDING narrator-origin ones — see
   * `waitForNonNarratorReplyContains`'s contract doc for why this exists
   * alongside the plain `jarvisEntries()` above. */
  private nonNarratorJarvisEntries(): Locator {
    return this.page.locator(
      `[data-testid="${TESTIDS.jarvis.entry}"][data-role="jarvis"]:not([data-origin="narrator"])`,
    );
  }

  private lastNonNarratorJarvisEntry(): Locator {
    return this.nonNarratorJarvisEntries().last();
  }

  private confirmCard(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.confirmCard);
  }

  /** Narrator-origin entries — `data-origin="narrator"` on the shared
   * `jarvis-entry` testid (see JarvisOverlay.tsx). */
  private narratorEntries(): Locator {
    return this.page.locator(
      `[data-testid="${TESTIDS.jarvis.entry}"][data-origin="narrator"]`,
    );
  }

  /** "drive: <kind>" rows — plain jarvis-role entries folded by
   * `JarvisMachine.recordDriveOutcome`, sharing the generic entry template
   * (no `tool`/`origin` field of their own). */
  private driveRows(): Locator {
    return this.jarvisEntries().filter({ hasText: /^drive: / });
  }

  private confirmApprove(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.confirmApprove);
  }

  private guideToggle(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.guideToggle);
  }

  private guidePanel(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.guidePanel);
  }

  /** Matched by substring, same pattern as `driveRows()` above — every
   * command in the catalog is a unique string, so a substring match never
   * risks hitting more than one row. */
  private guideRow(text: string): Locator {
    return this.guidePanel()
      .getByTestId(TESTIDS.jarvis.guideRow)
      .filter({ hasText: text });
  }

  private demoRun(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.demoRun);
  }

  private demoProgressEl(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.demoProgress);
  }

  private demoStop(): Locator {
    return this.page.getByTestId(TESTIDS.jarvis.demoStop);
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

  async waitForOrbVisible(timeoutMs: number): Promise<void> {
    await expect(this.orb()).toBeVisible({ timeout: timeoutMs });
  }

  async waitForOverlayVisible(): Promise<void> {
    await expect(this.overlay()).toBeVisible();
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

  async waitForNonNarratorReplyContains(
    fragment: string,
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.lastNonNarratorJarvisEntry()).toContainText(fragment, {
      timeout: timeoutMs,
    });
  }

  async waitForNonNarratorReplyDone(timeoutMs: number): Promise<void> {
    await expect(this.lastNonNarratorJarvisEntry()).toHaveAttribute(
      "data-done",
      "true",
      { timeout: timeoutMs },
    );
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

  async dockPanel(panelId: string): Promise<void> {
    await this.panelDock(panelId).click();
    // Fold the debounced-write wait into the action itself (see the timeout
    // constants' doc above) so a caller that reloads right after never races
    // WorkspacePersistenceWriter's 500ms debounce.
    await this.page.waitForFunction(
      ({ key, id }) => {
        const raw = localStorage.getItem(key);
        return raw?.includes(id) ?? false;
      },
      { key: WORKSPACE_LAYOUT_STORAGE_KEY, id: panelId },
      { timeout: WORKSPACE_LAYOUT_PERSIST_TIMEOUT_MS },
    );
  }

  async isPanelDocked(panelId: string): Promise<boolean> {
    return (await this.dockedPanelUndock(panelId).count()) > 0;
  }

  async undockPanel(panelId: string): Promise<void> {
    await this.dockedPanelUndock(panelId).click();
  }

  async waitForPanelDockedLive(panelId: string): Promise<void> {
    await expect(this.dockedPanel(panelId)).toBeVisible({
      timeout: PANEL_DOCKED_LIVE_TIMEOUT_MS,
    });
    await expect(this.dockedPanelLine(panelId)).toBeVisible({
      timeout: PANEL_DOCKED_LIVE_TIMEOUT_MS,
    });
  }

  async waitForNarrationFlare(): Promise<void> {
    await expect(this.orb()).toHaveAttribute("data-jarvis-state", "attention", {
      timeout: NARRATION_FLARE_TIMEOUT_MS,
    });
  }

  async waitForDriveRowCount(count: number): Promise<void> {
    await expect(this.driveRows()).toHaveCount(count, {
      timeout: DRIVE_ROW_TIMEOUT_MS,
    });
  }

  async narrationEntryCount(): Promise<number> {
    return await this.narratorEntries().count();
  }

  async openGuide(): Promise<void> {
    await this.guideToggle().click();
    await expect(this.guidePanel()).toBeVisible();
  }

  async clickGuideCommand(text: string): Promise<void> {
    await this.guideRow(text).click();
  }

  async startFullDemo(): Promise<void> {
    await this.demoRun().click();
  }

  async demoProgress(): Promise<string | null> {
    if ((await this.demoProgressEl().count()) === 0) {
      return null;
    }

    return await this.demoProgressEl().innerText();
  }

  async stopFullDemo(): Promise<void> {
    await this.demoStop().click();
  }

  async waitForDemoStep(n: number): Promise<void> {
    await expect(this.demoProgressEl()).toHaveText(new RegExp(`^STEP ${n}/`), {
      timeout: DEMO_STEP_TIMEOUT_MS,
    });
  }
}
