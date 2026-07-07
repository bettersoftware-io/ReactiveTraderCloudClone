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

  async dragFirstHandleBy(delta: number): Promise<void> {
    const handle = this.first();
    const box = await handle.boundingBox();

    if (box === null) {
      throw new Error("splitter handle has no bounding box");
    }

    // aria-orientation "vertical" = a row split's handle (resizes along x);
    // "horizontal" = a column split's handle (resizes along y).
    const orientation = await handle.getAttribute("aria-orientation");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const tx = orientation === "vertical" ? cx + delta : cx;
    const ty = orientation === "vertical" ? cy : cy + delta;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    // Multiple steps so the engine's pointermove listener fires mid-drag, the
    // way a real drag does (a single jump can skip the handler).
    await this.page.mouse.move(tx, ty, { steps: 8 });
    await this.page.mouse.up();
  }
}
