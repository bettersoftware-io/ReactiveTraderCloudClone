import type { Locator, Page } from "@playwright/test";

import type { LayoutPO } from "../contracts/Layout";
import { TESTIDS } from "../contracts/testids";

const HANDLE = `hr[data-testid^="${TESTIDS.layout.handlePrefix}"]`;

export class PlaywrightLayout implements LayoutPO {
  constructor(private readonly page: Page) {}

  private first(): Locator {
    return this.page.locator(HANDLE).first();
  }

  async handleCount(): Promise<number> {
    return await this.page.locator(HANDLE).count();
  }

  async firstHandleSize(): Promise<number> {
    return Number(await this.first().getAttribute("aria-valuenow"));
  }

  async dragFirstHandleBy(dx: number): Promise<void> {
    const box = await this.first().boundingBox();

    if (box === null) {
      throw new Error("splitter handle has no bounding box");
    }

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    // Multiple steps so the engine's pointermove listener fires mid-drag, the
    // way a real drag does (a single jump can skip the handler).
    await this.page.mouse.move(cx + dx, cy, { steps: 8 });
    await this.page.mouse.up();
  }
}
