import { expect, type Locator, type Page } from "@playwright/test";

import type {
  FirstDockRender,
  LayoutPO,
  PopoutWindowPO,
} from "../contracts/Layout";
import type { PrefsLayoutEngine } from "../contracts/Preferences";
import { TESTIDS } from "../contracts/testids";
import { readBoxWhenLaidOut } from "./geometry";

const HANDLE = `hr[data-testid^="${TESTIDS.layout.handlePrefix}"]`;
// dockview-core's own draggable tab wrapper (see dockview-core's Tab
// component — `_element.className = 'dv-tab'`), NOT the app's header nodes
// portalled inside it (the `dock-tab-<id>` mount, holding the panel's head
// tabs or title). The drag gesture must target THIS element: it is the one
// dockview attaches its `draggable` + drop-zone listeners to.
const DOCK_TAB = ".dv-tab";
// dockview-core's own group wrapper class — the ancestor a tab and its
// content container share (see the module doc above) — used here to read a
// whole panel's real on-screen box, header + body together.
const DOCK_GROUPVIEW_CLASS = "dv-groupview";

// The prefix `LocalStorageDockLayoutStore` keys every per-tab blob under
// (packages/{client-react,client-solid}/src/app/adapters/LocalStorageDockLayoutStore.ts).
const DOCK_LAYOUT_STORAGE_PREFIX = "rtc-dock-layout-";

/**
 * `createDockEngine`'s own layout-blob write is DEBOUNCED (`debounceMs`,
 * default 250ms — packages/layout-dockview/src/createDockEngine.ts) before
 * it lands in `localStorage` under `DOCK_LAYOUT_STORAGE_PREFIX`. A float
 * persists deliberately (design §3.3 — unlike a pop-out, which is
 * scrubbed from the blob on purpose, so `popoutPanel` needs no such wait),
 * which means a `floatPanel` call immediately followed by a reload — this
 * suite's persistence test does exactly that — races the debounce and can
 * lose the float on restore: a real gap no jsdom test (which never drives a
 * real `page.reload()`) would ever surface. Generous margin over 250ms for
 * CI jitter — same idiom as `Jarvis.ts`'s `dockPanel`, which waits out a
 * DIFFERENT (500ms) debounce the same way.
 */
const DOCK_LAYOUT_PERSIST_TIMEOUT_MS = 5_000;

/** A serialized dockview leaf's own panel-id list — the one field this
 * driver reads off `LeafData` (`createDockEngine.ts`'s internal type; this
 * driver has no import access to it, so it re-states the one shape it
 * reads). */
interface DockLayoutLeafData {
  readonly views?: readonly string[];
}

/** The page global `recordFirstDockRender`'s init script writes its
 * snapshot to (read back by `firstDockRender`). Type-only: the init script
 * ships as source text, and this annotation is erased from it. */
interface FirstDockRenderWindow {
  __rtcFirstDockRender?: unknown;
}

/** One node of a `floatingGroups` entry's own nested grid (the rare
 * multi-panel float — see `DockLayoutFloatingGroupEntry`'s doc): a leaf's
 * `data.views` lists its panel ids directly; a branch's `data` is its
 * children, walked recursively. Mirrors `createDockEngine.ts`'s own
 * `GridNode`. */
interface DockLayoutGridNode {
  readonly type: "leaf" | "branch";
  readonly data?: DockLayoutLeafData | readonly DockLayoutGridNode[];
}

/** One entry of `createDockEngine`'s serialized `floatingGroups` array
 * (dockview-core's `FloatingGroupService.serialize()`): a solo-panel float
 * (today's only case) serializes as `{ data: { views: [...] }, position }`;
 * a float whose group itself holds a split serializes as
 * `{ grid: { root }, position }` instead — `panelIdsOfFloatingGroup` below
 * reads whichever shape is present. */
interface DockLayoutFloatingGroupEntry {
  readonly data?: DockLayoutLeafData;
  readonly grid?: { readonly root: DockLayoutGridNode };
}

/** The one field of `createDockEngine`'s serialized blob this driver reads —
 * dockview-core's own `floatingGroups` key (see the doc above). */
interface DockLayoutBlobShape {
  readonly floatingGroups?: readonly DockLayoutFloatingGroupEntry[];
}

/** A dockview group's on-screen rectangle, in CSS px. */
interface DockGroupBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PlaywrightLayout implements LayoutPO {
  constructor(private readonly page: Page) {}

  private first(): Locator {
    return this.page.locator(HANDLE).first();
  }

  private engineRoot(): Locator {
    return this.page.getByTestId(TESTIDS.layout.engineRoot);
  }

  private floatControl(panelId: string): Locator {
    return this.page.getByTestId(TESTIDS.layout.floatControl(panelId));
  }

  /** `panelId`'s dockview group element — walked up from its `.dv-tab`
   * mount (present for docked AND floating groups alike) to the shared
   * `.dv-groupview` ancestor, so its bounding box covers the whole panel
   * (header + body), not just the tab strip. */
  private group(panelId: string): Locator {
    return this.page
      .getByTestId(TESTIDS.layout.dockTab(panelId))
      .locator(
        `xpath=ancestor::*[contains(concat(' ', @class, ' '), ' ${DOCK_GROUPVIEW_CLASS} ')]`,
      )
      .first();
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
    // The engine ROOT's `data-maximized` (the maximized panel id, or "" when
    // none) — both engines mirror this attribute exactly (Task 10's default
    // flip), so this is the engine-agnostic witness now, not a per-panel one
    // (dockview has no stable per-panel testid for a STATIC panel the way
    // InhouseLayoutEngine's PanelLeaf does).
    await expect(this.engineRoot()).toHaveAttribute("data-maximized", panelId, {
      timeout: timeoutMs,
    });
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

  /** The dockview group element holding panel `panelId`, found through the
   * panel's own head-slot mount inside it. */
  private dockGroupBox(panelId: string): Promise<DockGroupBox> {
    return this.page
      .getByTestId(TESTIDS.layout.dockTab(panelId))
      .evaluate((mount) => {
        const group = mount.closest(".dv-groupview");

        if (group === null) {
          throw new Error("dock tab mount is not inside a .dv-groupview");
        }

        const r = group.getBoundingClientRect();

        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
  }

  async dockPanelWidth(panelId: string): Promise<number> {
    return (await this.dockGroupBox(panelId)).width;
  }

  async dragDockSashLeftOf(panelId: string, dx: number): Promise<void> {
    const group = await this.dockGroupBox(panelId);
    // The sash on the group's left edge: a VERTICAL `.dv-sash` whose right
    // edge meets the group's left edge. Located by geometry rather than by
    // index, so it survives dockview reordering its sash containers.
    const sash = await this.page.evaluate((left) => {
      const hit = [...document.querySelectorAll(".dv-sash")]
        .map((element) => {
          return element.getBoundingClientRect();
        })
        .find((r) => {
          return r.height > r.width && Math.abs(r.x + r.width - left) <= 8;
        });

      return hit === undefined ? null : { x: hit.x, width: hit.width };
    }, group.x);

    if (sash === null) {
      throw new Error(`no vertical dock sash on the left edge of ${panelId}`);
    }

    const cx = sash.x + sash.width / 2;
    // Grab the sash at a point where it is the TOPMOST element. A floating
    // group sits above the grid and can cover part of the sash — a fixed
    // grab point then lands on the float, and the drag moves nothing.
    // Probed down the group from a quarter to three quarters, clear of the
    // corners where the rail's own horizontal sash starts.
    const probe = await this.page.evaluate(
      ({ x, top, height }) => {
        const covering: string[] = [];

        for (const f of [0.25, 0.4, 0.55, 0.7, 0.85]) {
          const y = top + height * f;
          const hit = document.elementFromPoint(x, y);

          if (hit?.closest(".dv-sash") !== null && hit !== null) {
            return { y, covering };
          }

          covering.push(
            `${f}:${hit?.className.toString().slice(0, 40) ?? "none"}`,
          );
        }

        return { y: null, covering };
      },
      { x: cx, top: group.y, height: group.height },
    );

    if (probe.y === null) {
      throw new Error(
        `the sash left of ${panelId} is covered along its whole length (${probe.covering.join(", ")})`,
      );
    }

    const cy = probe.y;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    // Stepped, so pointermove fires mid-drag the way a real drag does — the
    // engine releases a design pin on the FIRST move, not on pointerdown.
    await this.page.mouse.move(cx + dx, cy, { steps: 10 });
    await this.page.mouse.up();
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

  async dragDockTabToEdge(
    panelId: string,
    targetTestId: string,
    edge: "left" | "right" | "top" | "bottom",
  ): Promise<void> {
    // Same locators and gesture as dragDockTabOnto (see its comments for
    // the .dv-tab / .dv-content-container / multi-step rationale) — only
    // the destination point differs: inside dockview's EDGE band, so the
    // drop splits a new group instead of merging.
    const tab = this.engineRoot()
      .locator(DOCK_TAB)
      .filter({ has: this.page.getByTestId(TESTIDS.layout.dockTab(panelId)) });

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
        `dragDockTabToEdge: missing bounding box for tab ${JSON.stringify(panelId)} or drop target ${JSON.stringify(targetTestId)}`,
      );
    }

    // 12% in from the chosen edge: far enough in to be over the group body,
    // far enough out to sit inside dockview's edge band rather than the
    // centre (merge) region.
    const inset = 0.12;
    const dstX =
      edge === "left"
        ? dstBox.x + dstBox.width * inset
        : edge === "right"
          ? dstBox.x + dstBox.width * (1 - inset)
          : dstBox.x + dstBox.width / 2;

    const dstY =
      edge === "top"
        ? dstBox.y + dstBox.height * inset
        : edge === "bottom"
          ? dstBox.y + dstBox.height * (1 - inset)
          : dstBox.y + dstBox.height / 2;

    await this.page.mouse.move(
      srcBox.x + srcBox.width / 2,
      srcBox.y + srcBox.height / 2,
    );
    await this.page.mouse.down();
    await this.page.mouse.move(dstX, dstY, { steps: 12 });
    await this.page.mouse.up();
  }

  async collapsePanel(panelId: string): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.layout.collapseControl(panelId))
      .click();
  }

  async expandPanel(panelId: string): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.layout.collapseControl(panelId))
      .click();
  }

  async waitDockCollapsed(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute(
      "data-collapsed",
      panelIds.join(" "),
      { timeout: timeoutMs },
    );
  }

  async popoutPanel(panelId: string): Promise<PopoutWindowPO> {
    // window.open fires on the OPENER page — "popup" is its event, not the
    // context's generic "page".
    const popupPromise = this.page.waitForEvent("popup");
    await this.page.getByTestId(TESTIDS.layout.popoutControl(panelId)).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    return {
      waitForTestId: async (
        testId: string,
        timeoutMs: number,
      ): Promise<void> => {
        await popup
          .getByTestId(testId)
          .waitFor({ state: "attached", timeout: timeoutMs });
      },
      closeFromInside: async (): Promise<void> => {
        await popup.evaluate(() => {
          window.close();
        });
      },
    };
  }

  async waitDockPopped(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute(
      "data-popped",
      panelIds.join(" "),
      { timeout: timeoutMs },
    );
  }

  async floatPanel(panelId: string): Promise<void> {
    await this.floatControl(panelId).click();
    // See DOCK_LAYOUT_PERSIST_TIMEOUT_MS's doc: fold the debounced
    // dock-layout write into the action itself, so a caller that reloads
    // right after never races it. The predicate below asserts `id` is
    // POSITIVELY a member of some `floatingGroups` entry's own panel ids —
    // not merely that `id` appears somewhere in the blob (dockview's
    // `panels` dictionary always lists every managed panel, floating or
    // not, so a whole-blob substring match would pass on ANY panel's float
    // persisting, not necessarily this one).
    await this.page.waitForFunction(
      ({ prefix, id }) => {
        // Runs inside the browser context — Playwright serializes only this
        // function's own SOURCE TEXT, so its logic must be fully
        // self-contained (no closures over values declared outside `arg`).
        // Its parameter/return type annotations below are erased at
        // compile time and cost nothing at runtime, so they safely
        // reference the module-level `DockLayout*` interfaces for
        // documentation and type-checking.
        function panelIdsOfNode(node: DockLayoutGridNode): readonly string[] {
          if (node.type === "leaf") {
            return (node.data as DockLayoutLeafData)?.views ?? [];
          }

          return (node.data as readonly DockLayoutGridNode[]).flatMap(
            panelIdsOfNode,
          );
        }

        function panelIdsOfFloatingGroup(
          entry: DockLayoutFloatingGroupEntry,
        ): readonly string[] {
          return entry.grid !== undefined
            ? panelIdsOfNode(entry.grid.root)
            : (entry.data?.views ?? []);
        }

        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);

          if (key === null || !key.startsWith(prefix)) {
            continue;
          }

          const raw = localStorage.getItem(key);

          if (raw === null) {
            continue;
          }

          try {
            const parsed = JSON.parse(raw) as DockLayoutBlobShape;

            if (
              parsed.floatingGroups?.some((entry) => {
                return panelIdsOfFloatingGroup(entry).includes(id);
              }) === true
            ) {
              return true;
            }
          } catch {
            // Not a dock-layout blob (or caught mid-write) — keep scanning.
          }
        }

        return false;
      },
      { prefix: DOCK_LAYOUT_STORAGE_PREFIX, id: panelId },
      { timeout: DOCK_LAYOUT_PERSIST_TIMEOUT_MS },
    );
  }

  async dockPanel(panelId: string): Promise<void> {
    // Read the LIVE witness, not `waitDockFloating` — this must fail fast
    // on a panel that was never floating, rather than waiting out a full
    // timeout for a state that will never arrive.
    const raw = (await this.engineRoot().getAttribute("data-floating")) ?? "";
    const floating = raw === "" ? [] : raw.split(" ");

    if (!floating.includes(panelId)) {
      throw new Error(
        `dockPanel(${panelId}): panel is not floating, so this click would float it instead of docking it`,
      );
    }

    await this.floatControl(panelId).click();
  }

  async waitDockFloating(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute(
      "data-floating",
      panelIds.join(" "),
      { timeout: timeoutMs },
    );
  }

  async recordFirstDockRender(panelId: string): Promise<void> {
    // `addInitScript` runs in every document this page loads from here on,
    // before any app script — so the observer is watching when the dock's
    // first render lands. It snapshots ONCE per document, in the microtask
    // right after the render that first mounts `panelId`'s head controls:
    // everything that render committed is in the DOM, and nothing a LATER
    // layout change publishes (a container settle, a resize, a drag) can
    // have reached it yet. A polled wait cannot make that distinction — it
    // reads true the moment any later change repairs the state, which is
    // exactly how a restored float's missing publish once hid behind a
    // passing `waitDockFloating`.
    await this.page.addInitScript(
      ({ engineRoot, float, collapse, maximize }) => {
        // Self-contained: Playwright ships only this function's source.
        const win = window as unknown as FirstDockRenderWindow;
        const observer = new MutationObserver(() => {
          const control = document.querySelector(
            `[data-testid="${engineRoot}"][data-engine="dockview"] [data-testid="${float}"]`,
          );

          if (control === null || win.__rtcFirstDockRender !== undefined) {
            return;
          }

          const root = control.closest(`[data-testid="${engineRoot}"]`);
          const raw = root?.getAttribute("data-floating") ?? "";

          win.__rtcFirstDockRender = {
            floating: raw === "" ? [] : raw.split(" "),
            floatControlLabel: control.getAttribute("aria-label"),
            hasCollapseControl:
              document.querySelector(`[data-testid="${collapse}"]`) !== null,
            hasMaximizeControl:
              document.querySelector(`[data-testid="${maximize}"]`) !== null,
          };
          observer.disconnect();
        });

        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      },
      {
        engineRoot: TESTIDS.layout.engineRoot,
        float: TESTIDS.layout.floatControl(panelId),
        collapse: TESTIDS.layout.collapseControl(panelId),
        maximize: TESTIDS.layout.maximizeControl(panelId),
      },
    );
  }

  async firstDockRender(timeoutMs: number): Promise<FirstDockRender> {
    const handle = await this.page.waitForFunction(
      () => {
        return (window as unknown as FirstDockRenderWindow)
          .__rtcFirstDockRender;
      },
      undefined,
      { timeout: timeoutMs },
    );

    return (await handle.jsonValue()) as FirstDockRender;
  }

  async panelHeight(panelId: string): Promise<number> {
    const box = await readBoxWhenLaidOut(
      this.group(panelId),
      `panel ${panelId}'s dockview group`,
    );

    return box.height;
  }

  async panelSitsInFloat(panelId: string): Promise<boolean> {
    return this.group(panelId).evaluate((element) => {
      return element.closest(".dv-resize-container") !== null;
    });
  }
}
