import { expect, type Locator, type Page } from "@playwright/test";

import type {
  FirstDockRender,
  FloatBox,
  FloatDockSide,
  FloatResizeHandle,
  LayoutPO,
  PopoutWindowPO,
  RootTheme,
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

/**
 * How long the dock blob's bytes must hold still before
 * `waitDockLayoutQuiescent` calls the channel settled. Comfortably over the
 * 250ms debounce above — that margin is what makes it a witness rather than
 * a sleep: the blob is UNCHANGED across a window longer than any pending
 * write could take to land, so there is no pending write.
 */
const DOCK_LAYOUT_SETTLE_MS = 600;

// `WorkspacePersistenceWriter` debounces the layer-2 LayoutState write
// (`collapsed`/`closed`/root tree — a SEPARATE channel from the dock blob
// above) by `WORKSPACE_PERSIST_DEBOUNCE_MS` (500ms —
// packages/client-core/src/layout/workspacePersistenceWriter.ts). Hardcoded
// here rather than imported, same reasoning as `Jarvis.ts`'s own copy: the
// suite runs against either client via `RTC_CLIENT_PKG`, and both export the
// identical string.
const WORKSPACE_LAYOUT_STORAGE_KEY = "rtc-workspace-layout-v1";
/**
 * Loading a saved layout replaces the WHOLE LayoutState (collapsed/closed/
 * root) synchronously, but the writer above only PERSISTS it after this
 * debounce — a `loadLayoutPreset` call immediately followed by a reload
 * (this suite's own persistence step) races it exactly the way `floatPanel`
 * above already documents for the dock blob's debounce, on this SEPARATE
 * channel. Generous margin over 500ms for CI jitter.
 */
const WORKSPACE_LAYOUT_PERSIST_TIMEOUT_MS = 5_000;

/** Stands in for the saved-layout row names when the LAYOUTS section is not
 * on screen at all — see `presetRowNames`. Spelled as prose so it can never
 * collide with a real preset name a scenario might save. */
const NO_LAYOUTS_SECTION = "<no LAYOUTS section on screen>";

/** How many times `dragDockTabToPoint` re-drives a dock-tab drag whose
 * release the page never received. Four, because the loss is a per-gesture
 * coin flip measured at ~7% under an 8× CPU throttle and independent
 * between attempts — four leaves a residue far below this suite's other
 * noise, while a genuine "the page never takes this drop" still fails in
 * well under a second of extra gesture. */
const DOCK_DRAG_ATTEMPTS = 4;

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
/** A viewport point to press at. */
interface GripPoint {
  readonly x: number;
  readonly y: number;
}

interface FirstDockRenderWindow {
  __rtcFirstDockRender?: unknown;
}

/** What one dock-tab drag gesture can be shown to have done to the page —
 * see `dragDockTabToPoint`, which re-drives the gesture until `dropped`. */
interface DockDragWitness {
  started: boolean;
  offered: boolean;
  dropped: boolean;
}

/** The page globals `armDockDragWitness` writes: the record itself (carrying
 * the destination point its `offered` test is against) and the once-per-
 * document guard for its listeners. Type-only, like the two below. */
interface DockDragWitnessWindow {
  __rtcDockDragWitness?: DockDragWitness & { x: number; y: number };
  __rtcDockDragListening?: boolean;
}

/** The page global `waitDockLayoutQuiescent` keeps its running state on:
 * the last dock-blob snapshot it saw and when that snapshot first appeared.
 * Type-only, like `FirstDockRenderWindow` above. */
interface DockQuiescenceWindow {
  __rtcDockQuiescence?: { snapshot: string; since: number };
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

  /** The View menu's LAYOUTS section (Phase 6b) — the
   * neither-client-nor-engine-specific testid `LayoutPresetsSection.tsx`
   * shares verbatim between the React and Solid clients. */
  private layoutSection(): Locator {
    return this.page.getByTestId(TESTIDS.viewMenu.layouts);
  }

  /** A saved-layout row found by its ACCESSIBLE NAME (the preset's own
   * name), never a guessed id — see `LayoutPO.loadLayoutPreset`'s doc for
   * why. `exact` avoids a short name accidentally substring-matching the
   * "Save current as…" opener, which is a `menuitem` row too. */
  private layoutPresetRow(name: string): Locator {
    return this.layoutSection().getByRole("menuitem", { name, exact: true });
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
    const dstBox = await target.boundingBox();

    if (dstBox === null) {
      throw new Error(
        `dragDockTabOnto: missing bounding box for drop target ${JSON.stringify(targetTestId)}`,
      );
    }

    await this.dragDockTabToPoint(
      tab,
      { x: dstBox.x + dstBox.width / 2, y: dstBox.y + dstBox.height / 2 },
      `dragDockTabOnto(${panelId} → ${targetTestId})`,
    );
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
    const dstBox = await target.boundingBox();

    if (dstBox === null) {
      throw new Error(
        `dragDockTabToEdge: missing bounding box for drop target ${JSON.stringify(targetTestId)}`,
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

    await this.dragDockTabToPoint(
      tab,
      { x: dstX, y: dstY },
      `dragDockTabToEdge(${panelId} → ${targetTestId}, ${edge})`,
    );
  }

  /**
   * Presses `tab`, drags it to `dst` and releases — and only returns once
   * the page can be shown to have RECEIVED that release as a drag `drop`
   * event, re-driving the whole gesture when it did not.
   *
   * The retry exists because a Playwright drag can be lost with no error at
   * all, and this suite has been red on `main` twice for it (runs
   * 35459103406 / 35531428856, `layout.spec.ts:68`, both alternative-core
   * lanes, one react and one solid). `layout.spec.ts:18` had been carried
   * as a separate "known flake" with the same `data-groups` expected-3-
   * got-4 signature; it drives the same helper, so it is the same loss, not
   * a second one.
   *
   * Measured locally under `Emulation.setCPUThrottlingRate` — 0 failures in
   * 10 gestures unthrottled, 2 in 30 at 8×, 0 in 25 at 20×. The lost
   * gesture fires `dragstart` and a full run of `dragover`s, dockview's own
   * `.dv-drop-target` overlay IS showing over the destination, and then
   * Chromium ends the drag with `dragend` and no `drop`: the renderer's
   * accept state for the last `dragover` has not reached the browser
   * process by the time `mouse.up`'s CDP drop command arrives. Nothing is
   * dropped, nothing throws, and the caller's next assertion blames the
   * product for a gesture the product was never shown.
   *
   * Which is why the witness is the `drop` EVENT and not a longer wait on
   * the outcome: a longer timeout cannot turn a release that was never
   * delivered into one that was.
   *
   * What still fails, and for the right reason:
   * - dockview stops MERGING a centre drop → the drop is still delivered,
   *   so this returns on the first attempt and the caller's
   *   `expectDockGroups` fails exactly as it does today.
   * - dockview stops OFFERING the drop (its overlay never covers the
   *   destination — what a collapsed panel's locked strip does on purpose,
   *   measured: no overlay, and the drop lands unhandled) → this returns
   *   without retrying, so `dragBlotterOntoCollapsedAnalyticsIsRejected`
   *   still proves rejection rather than waiting one out.
   * - the tab stops being draggable at all → no `dragstart`, every attempt
   *   spent, and the throw below names THAT, instead of a group count.
   */
  private async dragDockTabToPoint(
    tab: Locator,
    dst: GripPoint,
    label: string,
  ): Promise<void> {
    let last: DockDragWitness = {
      started: false,
      offered: false,
      dropped: false,
    };

    for (let attempt = 1; attempt <= DOCK_DRAG_ATTEMPTS; attempt += 1) {
      const srcBox = await tab.boundingBox();

      if (srcBox === null) {
        throw new Error(`${label}: the dragged tab has no bounding box`);
      }

      await this.armDockDragWitness(dst);
      // Locator.dragTo's single-jump move (down, ONE move, up) never crosses
      // the browser's native-HTML5-drag movement threshold — dockview's tab
      // is `draggable=true` and relies on real incremental pointer movement
      // to promote a mousedown into a `dragstart` (confirmed against
      // dockview-core's own pointer-backend threshold detection). A
      // multi-step `mouse.move` (like `dragFirstHandleBy`'s splitter drag)
      // supplies that incremental movement in one gesture.
      await this.page.mouse.move(
        srcBox.x + srcBox.width / 2,
        srcBox.y + srcBox.height / 2,
      );
      await this.page.mouse.down();
      await this.page.mouse.move(dst.x, dst.y, { steps: 12 });
      await this.page.mouse.up();

      last = await this.readDockDragWitness(label);

      if (last.dropped) {
        return;
      }

      if (last.started && !last.offered) {
        // The page saw the drag and declined to take it — a real answer
        // from the app, not a lost gesture. Returning leaves the caller's
        // own assertion to judge it.
        return;
      }
    }

    throw new Error(
      `${label}: no drop reached the page in ${DOCK_DRAG_ATTEMPTS} attempts (last attempt: dragstart=${String(last.started)}, dockview drop overlay over the destination=${String(last.offered)}). dragstart=false means the tab never became a drag source at all. dragstart=true WITH an armed overlay has two causes this witness cannot tell apart, so check the APP before the harness: either dockview still paints its '.dv-drop-target' overlay but no longer accepts the drop (a dragover handler that stops calling preventDefault means the spec fires no drop event at all, by design — a product regression), or Chromium ended every drag without delivering it (the per-gesture flake this retry loop exists for).`,
    );
  }

  /** Installs (once per document) the drag listeners `dragDockTabToPoint`
   * reads, and arms a fresh record for a gesture aimed at `dst`. The
   * listeners are page-side and passive on purpose: a CDP round trip
   * between the last `dragover` and the drop is itself enough to change the
   * timing being measured. */
  private async armDockDragWitness(dst: GripPoint): Promise<void> {
    await this.page.evaluate((point) => {
      // Runs inside the browser context — self-contained, like
      // `floatPanel`'s predicate above.
      const win = window as DockDragWitnessWindow;
      win.__rtcDockDragWitness = {
        x: point.x,
        y: point.y,
        started: false,
        offered: false,
        dropped: false,
      };

      if (win.__rtcDockDragListening === true) {
        return;
      }

      win.__rtcDockDragListening = true;
      document.addEventListener(
        "dragstart",
        () => {
          const record = (window as DockDragWitnessWindow).__rtcDockDragWitness;

          if (record !== undefined) {
            record.started = true;
          }
        },
        { capture: true },
      );
      document.addEventListener(
        "dragover",
        () => {
          const record = (window as DockDragWitnessWindow).__rtcDockDragWitness;

          if (record === undefined) {
            return;
          }

          // dockview-core's own drop overlay. Overwritten every dragover,
          // so what survives is its state at the LAST one — the state the
          // release was about to be judged against.
          const overlay = document.querySelector(".dv-drop-target");

          if (overlay === null) {
            record.offered = false;

            return;
          }

          const r = overlay.getBoundingClientRect();
          record.offered =
            record.x >= r.x &&
            record.x <= r.x + r.width &&
            record.y >= r.y &&
            record.y <= r.y + r.height;
        },
        { capture: true },
      );
      document.addEventListener(
        "drop",
        () => {
          const record = (window as DockDragWitnessWindow).__rtcDockDragWitness;

          if (record !== undefined) {
            record.dropped = true;
          }
        },
        { capture: true },
      );
    }, dst);
  }

  private async readDockDragWitness(label: string): Promise<DockDragWitness> {
    const record = await this.page.evaluate(() => {
      return (window as DockDragWitnessWindow).__rtcDockDragWitness;
    });

    if (record === undefined) {
      // Only reachable if the document was replaced mid-gesture, which is
      // worth saying out loud rather than reading as "no drop".
      throw new Error(
        `${label}: the drag witness is gone — the page navigated during the gesture`,
      );
    }

    return record;
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
      waitForRootMode: async (
        mode: string,
        timeoutMs: number,
      ): Promise<void> => {
        await popup.waitForFunction(
          (expected) => {
            return (
              document.documentElement.getAttribute("data-mode") === expected
            );
          },
          mode,
          { timeout: timeoutMs },
        );
      },
      rootTheme: async (): Promise<RootTheme> => {
        return popup.evaluate(() => {
          const root = document.documentElement;

          return {
            skin: root.getAttribute("data-skin"),
            mode: root.getAttribute("data-mode"),
            textPrimaryToken: getComputedStyle(root)
              .getPropertyValue("--text-primary")
              .trim(),
          };
        });
      },
      isClosed: (): Promise<boolean> => {
        return Promise.resolve(popup.isClosed());
      },
      waitClosed: async (timeoutMs: number): Promise<void> => {
        // A window closed BEFORE this is called has already fired its one
        // "close" event — a fresh listener would never see it — so the
        // already-closed case is read directly rather than awaited.
        if (popup.isClosed()) {
          return;
        }

        await popup.waitForEvent("close", { timeout: timeoutMs });
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

  async waitDockClosed(
    panelIds: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute(
      "data-closed",
      panelIds.join(" "),
      { timeout: timeoutMs },
    );
  }

  async openViewMenu(): Promise<void> {
    await this.page.getByTestId(TESTIDS.viewMenu.toggle).click();
  }

  async closeViewMenu(): Promise<void> {
    // The SAME toggle button — the dropdown is a plain open/closed flip.
    await this.page.getByTestId(TESTIDS.viewMenu.toggle).click();
  }

  async toggleViewMenuRow(panelId: string): Promise<void> {
    // `press` (focus + a native key event), not `click`: a scenario can
    // legitimately have a FLOATING group's dockview resize-handle strip
    // spatially covering the open dropdown at this exact moment (the float
    // is real content sitting above it in the stacking order), which fails
    // `click`'s "receives pointer events" actionability check even though
    // the row is genuinely visible and enabled. `press("Enter")` activates
    // the SAME native `<button>` without a coordinate-based hit test, which
    // is what a keyboard user driving this exact menu would do anyway.
    await this.page.getByTestId(TESTIDS.viewMenu.row(panelId)).press("Enter");
  }

  async saveLayoutPreset(name: string): Promise<void> {
    // See `toggleViewMenuRow`'s doc for why `press`, not `click`, on every
    // LAYOUTS-section button below.
    await this.layoutSection()
      .getByRole("menuitem", { name: "Save current as…", exact: true })
      .press("Enter");
    // `fill` focuses + sets the value directly (no coordinate-based hit
    // test), so it needs no such guard even while covered the same way.
    await this.page.getByTestId(TESTIDS.viewMenu.layoutName).fill(name);
    await this.page
      .getByTestId(TESTIDS.viewMenu.layoutSaveConfirm)
      .press("Enter");
  }

  async loadLayoutPreset(name: string): Promise<void> {
    await this.withWorkspaceLayoutPersisted(async () => {
      await this.layoutPresetRow(name).press("Enter");
    });
  }

  async loadDefaultLayout(): Promise<void> {
    await this.withWorkspaceLayoutPersisted(async () => {
      await this.page
        .getByTestId(TESTIDS.viewMenu.layoutDefault)
        .press("Enter");
    });
  }

  /** Runs `action` (a click that replaces the WHOLE LayoutState — a preset
   * load or Default), then waits until BOTH persistence channels the action
   * writes have actually landed, so a caller that reloads right after never
   * races either one. Folded into the action itself, the same idiom
   * `floatPanel` above uses for the dock blob's own debounce.
   *
   * The two channels are genuinely separate and are waited on separately:
   * the layer-2 LayoutState under `WORKSPACE_LAYOUT_STORAGE_KEY` (500ms
   * debounce) by its value CHANGING, and `createDockEngine`'s own dock blob
   * (250ms debounce) by it falling QUIESCENT. Waiting only the longer one
   * and inferring the shorter had flushed is an ordering assumption, not a
   * witness — and it is the dock blob that carries a restored float. */
  private async withWorkspaceLayoutPersisted(
    action: () => Promise<void>,
  ): Promise<void> {
    const before = await this.page.evaluate((key) => {
      return localStorage.getItem(key);
    }, WORKSPACE_LAYOUT_STORAGE_KEY);

    await action();

    try {
      await this.page.waitForFunction(
        ({ key, previous }) => {
          return localStorage.getItem(key) !== previous;
        },
        { key: WORKSPACE_LAYOUT_STORAGE_KEY, previous: before },
        { timeout: WORKSPACE_LAYOUT_PERSIST_TIMEOUT_MS },
      );
    } catch (cause) {
      // The bare waitForFunction timeout reads as "the app never persisted
      // the layout", which is only one of the two ways to get here — and
      // the other one is not a defect at all.
      throw new Error(
        `withWorkspaceLayoutPersisted: "${WORKSPACE_LAYOUT_STORAGE_KEY}" still held its pre-action value after ${WORKSPACE_LAYOUT_PERSIST_TIMEOUT_MS}ms. Either the action never replaced the LayoutState, or it replaced it with a state BYTE-IDENTICAL to the live one — loading a preset equal to the current arrangement writes the same bytes back, and this change-witness can never fire for it. A caller in the second case must drive the click directly instead of through this helper, which has no way to tell "not persisted yet" from "persisted the same thing".`,
        { cause },
      );
    }

    await this.waitDockLayoutQuiescent();
  }

  /** Resolves once the dock-layout blob has stopped moving: its bytes have
   * been unchanged for longer than `createDockEngine`'s own debounce window
   * (see `DOCK_LAYOUT_PERSIST_TIMEOUT_MS`'s doc for the 250ms figure), so no
   * write can still be in flight.
   *
   * Quiescence rather than "the value changed", deliberately: a preset whose
   * dock tree matches the live one writes no new bytes at all, and a
   * change-witness would hang on it forever — the very trap the caller's own
   * failure message above names for the OTHER channel. Quiescence is
   * satisfied immediately in that case and is correct either way. */
  private async waitDockLayoutQuiescent(): Promise<void> {
    await this.page.evaluate(() => {
      delete (window as DockQuiescenceWindow).__rtcDockQuiescence;
    });

    try {
      await this.page.waitForFunction(
        ({ prefix, settleMs }) => {
          // Runs inside the browser context — self-contained, like
          // `floatPanel`'s predicate above. The running state lives on
          // `window` because the predicate is re-evaluated from source on
          // every poll and keeps nothing between calls.
          const win = window as DockQuiescenceWindow;
          const blobs: string[] = [];

          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);

            if (key?.startsWith(prefix) === true) {
              blobs.push(`${key}=${localStorage.getItem(key) ?? ""}`);
            }
          }

          const snapshot = blobs.sort().join("\u0000");
          const seen = win.__rtcDockQuiescence;

          if (seen === undefined || seen.snapshot !== snapshot) {
            win.__rtcDockQuiescence = { snapshot, since: Date.now() };

            return false;
          }

          return Date.now() - seen.since >= settleMs;
        },
        {
          prefix: DOCK_LAYOUT_STORAGE_PREFIX,
          settleMs: DOCK_LAYOUT_SETTLE_MS,
        },
        { timeout: DOCK_LAYOUT_PERSIST_TIMEOUT_MS, polling: 50 },
      );
    } catch (cause) {
      // A bare waitForFunction timeout names neither the channel nor the
      // window it was watching — the same gap its sibling above closed.
      throw new Error(
        `waitDockLayoutQuiescent: the dock blobs under "${DOCK_LAYOUT_STORAGE_PREFIX}" never held still for ${DOCK_LAYOUT_SETTLE_MS}ms inside ${DOCK_LAYOUT_PERSIST_TIMEOUT_MS}ms — something kept rewriting them. Either the app is in a write loop (an engine rebuild that re-serializes the layout and re-triggers its own debounced save), or DOCK_LAYOUT_SETTLE_MS has fallen close to createDockEngine's debounceMs, so an ordinary spaced-out write can keep resetting the window. This is never "the layout was not persisted": an IDLE channel satisfies the very first snapshot, so a timeout here means motion, not absence.`,
        { cause },
      );
    }
  }

  async deleteLayoutPreset(name: string): Promise<void> {
    // The row's bin and confirm are plain buttons, not `menuitem`s — found
    // by their own accessible name (LayoutPresetsSection.tsx's
    // `aria-label`s), the same "never a guessed id" discipline as
    // `layoutPresetRow`.
    await this.layoutSection()
      .getByRole("button", { name: `Delete ${name}…`, exact: true })
      .press("Enter");
    await this.layoutSection()
      .getByRole("button", { name: `Confirm deleting ${name}`, exact: true })
      .press("Enter");
  }

  async waitLayoutPresetNames(
    names: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    // `expect.poll` re-reads the whole row list until it matches, the same
    // retrying discipline as this driver's `toHaveAttribute` witnesses — a
    // save and a delete both reach the DOM through a published stream, so a
    // single snapshot read the instant after one of them races it.
    await expect
      .poll(
        () => {
          return this.presetRowNames();
        },
        { timeout: timeoutMs },
      )
      .toEqual([...names]);
  }

  /** The saved-layout rows' visible names, in DOM order — or the single
   * `NO_LAYOUTS_SECTION` marker when the section's own two always-rendered
   * rows are not both on screen.
   *
   * The marker is the point: the rows are read out of a DROPDOWN, so a
   * View menu that closed (or an engine with no LAYOUTS section at all)
   * yields the same bare `[]` a genuinely empty preset list does, and
   * `waitLayoutPresetNames([])` would then pass on a page showing nothing.
   * A distinct value makes that absence fail, and name itself in the
   * failure. */
  private async presetRowNames(): Promise<string[]> {
    const section = this.layoutSection();
    const anchors = await Promise.all([
      section.getByTestId(TESTIDS.viewMenu.layoutDefault).count(),
      section.getByTestId(TESTIDS.viewMenu.layoutSave).count(),
    ]);

    const anchored = anchors.every((count) => {
      return count === 1;
    });

    if (!anchored) {
      return [NO_LAYOUTS_SECTION];
    }

    const rows = await section.locator('[role="menuitem"]').all();
    const names: string[] = [];

    for (const row of rows) {
      const testid = await row.getAttribute("data-testid");

      // Excludes Default and the "Save current as…" opener — neither is a
      // stored preset — the same exclusion `ViewMenuPage.layoutRowIds`
      // applies in the ui-contract tier.
      if (
        testid === TESTIDS.viewMenu.layoutDefault ||
        testid === TESTIDS.viewMenu.layoutSave
      ) {
        continue;
      }

      names.push((await row.textContent())?.trim() ?? "");
    }

    return names;
  }

  async waitForTestId(testId: string, timeoutMs: number): Promise<void> {
    await this.page
      .getByTestId(testId)
      .waitFor({ state: "attached", timeout: timeoutMs });
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

  async dockGroupMates(panelId: string): Promise<readonly string[]> {
    return this.group(panelId).evaluate((element) => {
      return [...element.querySelectorAll("[data-panel-title]")].map((slot) => {
        return slot.getAttribute("data-panel-title") ?? "";
      });
    });
  }

  async panelWidth(panelId: string): Promise<number> {
    const box = await readBoxWhenLaidOut(
      this.group(panelId),
      `panel ${panelId}'s dockview group`,
    );

    return box.width;
  }

  async panelSitsInFloat(panelId: string): Promise<boolean> {
    return this.group(panelId).evaluate((element) => {
      return element.closest(".dv-resize-container") !== null;
    });
  }

  /** A point on `panelId`'s float head that is not one of its controls. */
  private floatHeadGrip(panelId: string): Promise<GripPoint> {
    // The grip is found, not assumed: the head is packed with controls
    // (sub-tabs, a filter input, chips), and a press on one of those keeps
    // its own meaning. Walk the head bar's mid-line for the first point
    // whose topmost element is not a control — the same test the engine
    // applies when deciding whether a press moves the float.
    return this.group(panelId).evaluate((element) => {
      const head = element.querySelector(".dv-tabs-and-actions-container");

      if (head === null) {
        throw new Error("floatHeadGrip: the group has no head bar");
      }

      const r = head.getBoundingClientRect();
      const y = r.y + r.height / 2;
      const controls =
        "button, a, input, select, textarea, [contenteditable], [role='button'], [role='menuitem']";

      for (let x = r.x + 4; x < r.right - 4; x += 4) {
        const hit = document.elementFromPoint(x, y);

        if (
          hit !== null &&
          head.contains(hit) &&
          hit.closest(controls) === null
        ) {
          return { x, y };
        }
      }

      throw new Error("floatHeadGrip: no free point on the head to grip");
    });
  }

  async floatBox(panelId: string): Promise<FloatBox> {
    return this.group(panelId).evaluate((element) => {
      const float = element.closest(".dv-resize-container");

      if (float === null) {
        throw new Error("floatBox: the panel is not in a float");
      }

      const r = float.getBoundingClientRect();

      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  }

  async dragFloatByHead(
    panelId: string,
    dx: number,
    dy: number,
  ): Promise<void> {
    const grip = await this.floatHeadGrip(panelId);

    // Stepped, like the sash and tab drags above: dockview's overlay moves
    // the float on each pointermove, taking its grip offset from the first.
    await this.page.mouse.move(grip.x, grip.y);
    await this.page.mouse.down();
    await this.page.mouse.move(grip.x + dx, grip.y + dy, { steps: 15 });
    await this.page.mouse.up();
  }

  async shiftDragFloatOnto(
    panelId: string,
    targetPanelId: string,
    side: FloatDockSide,
  ): Promise<void> {
    const grip = await this.floatHeadGrip(panelId);
    const target = await this.dockGroupBox(targetPanelId);
    // 10% in from the chosen edge: inside the engine's 25% edge band.
    const x =
      side === "left"
        ? target.x + target.width * 0.1
        : target.x + target.width * 0.9;
    const y = target.y + target.height / 2;

    await this.page.mouse.move(grip.x, grip.y);
    await this.page.mouse.down();
    // Shift pressed partway, as a user would: the move starts plain.
    await this.page.mouse.move(grip.x + 40, grip.y + 40, { steps: 4 });
    await this.page.keyboard.down("Shift");
    await this.page.mouse.move(x, y, { steps: 12 });
    await this.page.mouse.up();
    await this.page.keyboard.up("Shift");
  }

  async resizeFloatFrom(
    panelId: string,
    handle: FloatResizeHandle,
    dx: number,
    dy: number,
  ): Promise<void> {
    const grip = await this.group(panelId).evaluate((element, name) => {
      const handleElement = element
        .closest(".dv-resize-container")
        ?.querySelector(`:scope > .dv-resize-handle-${name}`);

      if (handleElement === null || handleElement === undefined) {
        throw new Error(`resizeFloatFrom: no ${name} handle on the float`);
      }

      const r = handleElement.getBoundingClientRect();

      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, handle);

    await this.page.mouse.move(grip.x, grip.y);
    await this.page.mouse.down();
    await this.page.mouse.move(grip.x + dx, grip.y + dy, { steps: 10 });
    await this.page.mouse.up();
  }
}
