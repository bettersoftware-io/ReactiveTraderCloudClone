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

  async waitMachineRowOfKind(kind: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page()
        .getByTestId(TESTIDS.devtools.machineRow)
        .filter({ hasText: kind })
        .first(),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async selectNavNode(nodeId: string, timeoutMs: number): Promise<void> {
    const node = this.page()
      .getByTestId(TESTIDS.devtools.navNode)
      .and(this.page().locator(`[data-scope-id="${nodeId}"]`));

    await node.waitFor({ state: "visible", timeout: timeoutMs });
    // Tree rows never remount (keyed by stable node id) and their only
    // animation is an opacity flash, so a plain click is stable here —
    // unlike timeline rows under a live stream.
    await node.click({ timeout: timeoutMs });
  }

  async waitTimelineRowsAllContain(
    text: string,
    timeoutMs: number,
  ): Promise<void> {
    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect(rows.first()).toBeAttached({ timeout: timeoutMs });
    await expect(rows.filter({ hasNotText: text })).toHaveCount(0, {
      timeout: timeoutMs,
    });
  }

  async clearTimeline(timeoutMs: number): Promise<number> {
    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect(rows.first()).toBeAttached({ timeout: timeoutMs });

    const seqs = await rows.evaluateAll((elements) => {
      return elements.map((el) => {
        return Number((el as HTMLElement).dataset.seq);
      });
    });
    const watermark = Math.max(...seqs);

    await this.page()
      .getByTestId(TESTIDS.devtools.clearLog)
      .click({ timeout: timeoutMs });

    return watermark;
  }

  async waitTimelineClearedPast(
    watermark: number,
    timeoutMs: number,
  ): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.devtools.unclearLog),
    ).toBeVisible({
      timeout: timeoutMs,
    });

    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect
      .poll(
        async () => {
          const seqs = await rows.evaluateAll((elements) => {
            return elements.map((el) => {
              return Number((el as HTMLElement).dataset.seq);
            });
          });

          // Until a post-clear row arrives, report the watermark itself so the
          // poll keeps waiting; any row AT or BELOW it is a real failure.
          return seqs.length === 0 ? watermark : Math.min(...seqs);
        },
        { timeout: timeoutMs },
      )
      .toBeGreaterThan(watermark);
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
    // Blur whatever is currently focused first: InspectorApp's global
    // shortcut dispatcher (InspectorApp.tsx) ignores ArrowUp entirely while
    // focus sits inside the nav tree (`target.closest("[data-nav-tree]")`) —
    // a nav-node click (selectNavNode) leaves the clicked <button> focused,
    // which would otherwise route the key to the tree's own cursor-nav
    // instead of the pin shortcut.
    await this.page().evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
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
