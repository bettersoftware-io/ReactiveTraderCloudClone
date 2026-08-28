import { expect, type Locator, type Page } from "@playwright/test";

import type { LayoutPO } from "../contracts/Layout";
import type { PrefsLayoutEngine } from "../contracts/Preferences";
import { TESTIDS } from "../contracts/testids";

const HANDLE = `hr[data-testid^="${TESTIDS.layout.handlePrefix}"]`;
// dockview-core's own draggable tab wrapper (see dockview-core's Tab
// component — `_element.className = 'dv-tab'`), NOT the app's header nodes
// portalled inside it (the `dock-tab-<id>` mount, holding the panel's head
// tabs or title). The drag gesture must target THIS element: it is the one
// dockview attaches its `draggable` + drop-zone listeners to.
const DOCK_TAB = ".dv-tab";

export class PlaywrightLayout implements LayoutPO {
  constructor(private readonly page: Page) {}

  private first(): Locator {
    return this.page.locator(HANDLE).first();
  }

  private panel(panelId: string): Locator {
    return this.page.getByTestId(TESTIDS.layout.panel(panelId));
  }

  private engineRoot(): Locator {
    return this.page.getByTestId(TESTIDS.layout.engineRoot);
  }

  async resizeHandleCount(): Promise<number> {
    return await this.page.locator(HANDLE).count();
  }

  async firstResizeHandleSize(): Promise<number> {
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

  async waitPanelMaximized(panelId: string, timeoutMs: number): Promise<void> {
    await expect(this.panel(panelId)).toHaveAttribute(
      "data-maximized",
      "true",
      { timeout: timeoutMs },
    );
  }

  async waitEngine(
    engine: PrefsLayoutEngine,
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute("data-engine", engine, {
      timeout: timeoutMs,
    });
  }

  async waitDockGroupCount(count: number, timeoutMs: number): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute(
      "data-groups",
      String(count),
      { timeout: timeoutMs },
    );
  }

  async dragDockTabOnto(panelId: string, targetTestId: string): Promise<void> {
    // Located by the panel's OWN mount inside the tab rather than by text:
    // the tab shows the panel's head slot (for fx-blotter, its "FX Blotter"
    // / "Activity" sub-tabs), so no single exact label identifies it.
    const tab = this.engineRoot()
      .locator(DOCK_TAB)
      .filter({ has: this.page.getByTestId(TESTIDS.layout.dockTab(panelId)) });

    // dockview's drop-zone detection reads the pointer's position relative
    // to the whole GROUP body, not the specific dropped-on element: a point
    // near an edge of that body registers as a SPLIT (a new group), only a
    // point nearer its centre registers as a MERGE (a new tab in the
    // existing group). `targetTestId` names a small element that can sit
    // anywhere inside the panel (e.g. near its top edge), so its own
    // bounding box is the wrong thing to drop onto — walk up to the
    // enclosing `.dv-content-container` (dockview-core's own panel-body
    // wrapper) and use ITS centre instead. Confirmed empirically: dropping
    // on the raw testid's box left `data-groups` unchanged (a split, tab
    // relocated but group count constant); dropping on the container's
    // centre reliably merges (10/10 local runs).
    const target = this.page
      .getByTestId(targetTestId)
      .locator(
        "xpath=ancestor::*[contains(concat(' ', @class, ' '), ' dv-content-container ')]",
      )
      .first();
    const srcBox = await tab.boundingBox();
    const dstBox = await target.boundingBox();

    if (srcBox === null || dstBox === null) {
      throw new Error(
        `dragDockTabOnto: missing bounding box for tab ${JSON.stringify(panelId)} or drop target ${JSON.stringify(targetTestId)}`,
      );
    }

    const srcX = srcBox.x + srcBox.width / 2;
    const srcY = srcBox.y + srcBox.height / 2;
    const dstX = dstBox.x + dstBox.width / 2;
    const dstY = dstBox.y + dstBox.height / 2;

    // Locator.dragTo's single-jump move (down, ONE move, up) never crosses
    // the browser's native-HTML5-drag movement threshold — dockview's tab
    // is `draggable=true` and relies on real incremental pointer movement to
    // promote a mousedown into a `dragstart` (confirmed against dockview-
    // core's own pointer-backend threshold detection). A multi-step
    // `mouse.move` (like `dragFirstHandleBy`'s splitter drag) supplies that
    // incremental movement in one gesture.
    await this.page.mouse.move(srcX, srcY);
    await this.page.mouse.down();
    await this.page.mouse.move(dstX, dstY, { steps: 12 });
    await this.page.mouse.up();
  }
}
