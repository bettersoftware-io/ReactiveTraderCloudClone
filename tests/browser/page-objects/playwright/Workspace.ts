import { expect, type Page } from "@playwright/test";

import {
  JARVIS_NARRATOR_ON_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "#/browser/authSeed.ts";

import { TESTIDS } from "../contracts/testids.ts";
import type { WorkspacePO } from "../contracts/Workspace.ts";
import { navigateAndAwaitMount } from "./appMount.ts";

/** The page globals the swap witnesses keep on `window`. */
interface WitnessWindow extends Window {
  __hotSwapMark?: number;
  __loginScreenSeen?: boolean;
  __loginWatchFrames?: number;
}

export class PlaywrightWorkspace implements WorkspacePO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** `page.goto(url)`, then wait until the app has mounted — see
   * `navigateAndAwaitMount` (a bare `goto` can return on an empty `#root`
   * while an async/Effect core's chunk is still loading). */
  private async gotoMounted(url: string): Promise<void> {
    await navigateAndAwaitMount(this.page, () => {
      return this.page.goto(url);
    });
  }

  async open(): Promise<void> {
    await this.gotoMounted("/");
  }

  async openFx(): Promise<void> {
    await this.gotoMounted("/");
    await this.page.getByTestId(TESTIDS.shell.tab("fx")).click();
  }

  async openCredit(): Promise<void> {
    await this.gotoMounted("/");
    await this.page.getByTestId(TESTIDS.shell.tab("credit")).click();
  }

  async openAdmin(): Promise<void> {
    await this.gotoMounted("/");
    await this.page.getByTestId(TESTIDS.shell.tab("admin")).click();
  }

  async openEquities(): Promise<void> {
    await this.gotoMounted("/");
    await this.page.getByTestId(TESTIDS.shell.tab("equities")).click();
  }

  async openWithNarratorThresholds(): Promise<void> {
    // The shared bootstrap (playwright-cucumber/world.ts or
    // playwright/_context.ts, whichever runner drives this scenario) seeds
    // JarvisNarrator OFF by default for hermeticity — see authSeed.ts. This
    // is the one ride that actually exercises narration, so opt back IN for
    // this page's own init-script chain: addInitScript callbacks run in
    // registration order on every navigation, so this one registers after
    // the shared OFF seed and wins on the goto() below (and any later
    // navigation in this context).
    await this.page.addInitScript(seedLocalStorageItem, {
      key: JARVIS_NARRATOR_STORAGE_KEY,
      value: JARVIS_NARRATOR_ON_VALUE,
    });
    await this.gotoMounted("/?narratorThresholds=test");
  }

  async openWithCoreImpl(impl: string): Promise<void> {
    await this.gotoMounted(`/?core=${impl}`);
  }

  async waitUrlHasNoCoreParam(timeoutMs: number): Promise<void> {
    await this.page.waitForURL(
      (url) => {
        return !url.searchParams.has("core");
      },
      { timeout: timeoutMs },
    );
  }

  async setNavigationMark(): Promise<void> {
    await this.page.evaluate(() => {
      (window as WitnessWindow).__hotSwapMark = 1;
    });
  }

  async navigationMark(): Promise<number | undefined> {
    return await this.page.evaluate(() => {
      return (window as WitnessWindow).__hotSwapMark;
    });
  }

  async watchForLoginScreen(): Promise<void> {
    await this.page.evaluate((loginTestId) => {
      // Self-contained: Playwright ships only this function's source text.
      // Sampled once per animation frame, i.e. at every chance the browser
      // has to paint, so a login screen that is ON SCREEN for even one frame
      // counts. Deliberately not a MutationObserver: the React client commits
      // the login screen and removes it again within one task, before any
      // paint, on every composition (each boot on all three cores, and each
      // swap) — react-bindings' `bind` serves its "unauthenticated" default
      // on the first render — and that never reaches the screen.
      const win = window as WitnessWindow;
      const selector = `[data-testid="${loginTestId}"]`;
      win.__loginScreenSeen = false;
      win.__loginWatchFrames = 0;

      function sample(): void {
        win.__loginWatchFrames = (win.__loginWatchFrames ?? 0) + 1;

        if (document.querySelector(selector) !== null) {
          win.__loginScreenSeen = true;
        }

        requestAnimationFrame(sample);
      }

      requestAnimationFrame(sample);
    }, TESTIDS.auth.loginScreen);
  }

  async loginScreenSeen(): Promise<boolean> {
    const { seen, frames } = await this.page.evaluate(() => {
      const win = window as WitnessWindow;
      return { seen: win.__loginScreenSeen, frames: win.__loginWatchFrames };
    });

    if (seen === undefined || frames === undefined) {
      throw new Error(
        "loginScreenSeen: no watch on this document — call watchForLoginScreen first (a navigation discards it)",
      );
    }

    if (frames === 0) {
      throw new Error(
        "loginScreenSeen: the watch has not sampled a single frame, so it cannot say what was on screen",
      );
    }

    return seen;
  }

  async waitSignedIn(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.shell.header)).toBeVisible({
      timeout: timeoutMs,
    });
    await expect(this.page.getByTestId(TESTIDS.auth.loginScreen)).toHaveCount(
      0,
    );
  }

  async waitCoreImpl(expected: string, timeoutMs: number): Promise<void> {
    await expect(this.page.locator("html")).toHaveAttribute(
      "data-core-impl",
      expected,
      { timeout: timeoutMs },
    );
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
    await navigateAndAwaitMount(this.page, () => {
      return this.page.reload();
    });
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
