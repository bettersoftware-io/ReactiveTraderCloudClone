import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DockEngineOptions } from "#/createDockEngine";
import {
  createDockEngine,
  DOCK_GLIDE_ATTRIBUTE,
  type DockMaximizeScope,
  type DockStripMap,
  GLIDE_ATTRIBUTE_MS,
  GROUP_GAP_PX,
} from "#/createDockEngine";

// jsdom (as of the pinned Node/jsdom combo here) has no ResizeObserver;
// dockview-core's own unit tests run under jsdom with the same stub.
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global patch
    (globalThis as any).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    };
  }
});

const FX_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

/** The real FX tab's shape: the main column (rates over blotter) beside a
 * RAIL column (analytics over positions) — the tree the maximize scopes are
 * about, where FX_LIKE's lone analytics leaf has no column to scope to. */
const RAIL_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    {
      kind: "split",
      dir: "column",
      sizes: [0.5, 0.5],
      children: [
        { kind: "panel", panelId: "fx-analytics" },
        { kind: "panel", panelId: "fx-positions" },
      ],
    },
  ],
} as const;

const attachedContainers: HTMLElement[] = [];

afterEach(() => {
  for (const el of attachedContainers.splice(0)) {
    el.remove();
  }
});

describe("createDockEngine", () => {
  it("builds groups + panels from the seed and mounts content via the hook", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    attachedContainers.push(container);
    const mounted: string[] = [];
    const engine = createDockEngine({
      container,
      seed: FX_LIKE,
      blob: null,
      panels: {
        title: (id: string) => {
          return id.toUpperCase();
        },
        mount: (id: string, el: HTMLElement) => {
          mounted.push(id);
          el.textContent = `content:${id}`;

          return () => {
            mounted.splice(mounted.indexOf(id), 1);
          };
        },
      },
      onLayoutChange: () => {},
      debounceMs: 0,
    });

    expect(engine.groupCount()).toBe(3);
    expect(mounted.sort()).toEqual(["fx-analytics", "fx-blotter", "fx-rates"]);
    expect(container.textContent).toContain("content:fx-rates");
    engine.dispose();
    expect(mounted).toEqual([]);
  });

  it("falls back to the seed on a corrupt blob", () => {
    const engine = createDockEngine({ ...base(), blob: "{not json" });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("falls back to the seed on a structurally-invalid blob", () => {
    const engine = createDockEngine({
      ...base(),
      blob: JSON.stringify({ hello: 1 }),
    });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("restores a valid blob (round-trip through its own serialisation)", () => {
    let saved: string | null = null;
    const first = createDockEngine({
      ...base(),
      onLayoutChange: (blob: string) => {
        saved = blob;
      },
      debounceMs: 0,
    });
    first.maximizePanel("fx-rates"); // any layout mutation triggers serialisation
    first.dispose();
    expect(saved).not.toBeNull();

    const second = createDockEngine({ ...base(), blob: saved });
    expect(second.groupCount()).toBe(3);
    second.dispose();
  });

  it("applies the hook-supplied title to each panel's tab", () => {
    const opts = base();
    const engine = createDockEngine(opts);

    // DockEngine exposes no title-reading accessor of its own, so assert
    // through the rendered DOM: HookTabRenderer (the engine's own tab
    // renderer — see the close-action test below for why it replaces
    // dockview's default) falls back, absent a `mountTab` hook, to writing
    // each panel's title into a `.rtc-dock-tab-title` node inside the tab.
    const titles = [...opts.container.querySelectorAll(".rtc-dock-tab-title")]
      .map((el) => {
        return el.textContent;
      })
      .sort();
    expect(titles).toEqual(["FX-ANALYTICS", "FX-BLOTTER", "FX-RATES"]);
    engine.dispose();
  });

  it("mounts the client's header slot into each panel's tab through mountTab", () => {
    const opts = base();
    const mounted: string[] = [];
    const disposed: string[] = [];

    opts.panels.mountTab = (
      panelId: string,
      element: HTMLElement,
    ): (() => void) => {
      mounted.push(panelId);
      element.append(`HEAD:${panelId}`);

      return (): void => {
        disposed.push(panelId);
      };
    };

    const engine = createDockEngine(opts);

    // One tab per panel, each holding the client's own nodes — and NO
    // fallback title label, so the header is never rendered twice.
    expect(mounted.sort()).toEqual(["fx-analytics", "fx-blotter", "fx-rates"]);
    const tabs = [...opts.container.querySelectorAll(".rtc-dock-tab")];
    expect(tabs).toHaveLength(3);
    expect(
      tabs.map((tab) => {
        return tab.textContent;
      }),
    ).toEqual(
      expect.arrayContaining([
        "HEAD:fx-rates",
        "HEAD:fx-blotter",
        "HEAD:fx-analytics",
      ]),
    );
    expect(opts.container.querySelector(".rtc-dock-tab-title")).toBeNull();
    // The tab is dockview's own draggable wrapper — the mount point must sit
    // INSIDE it, or the client's header would not be the drag surface.
    expect(tabs[0].closest(".dv-tab")).not.toBeNull();

    engine.dispose();
    expect(disposed.sort()).toEqual(["fx-analytics", "fx-blotter", "fx-rates"]);
  });

  it("mounts the active panel's controls into the group actions slot and remounts on active-panel change", () => {
    const opts = base();
    const log: string[] = [];

    opts.panels.mountActions = (
      panelId: string,
      element: HTMLElement,
    ): (() => void) => {
      log.push(`mount:${panelId}`);
      element.append(`CTRL:${panelId}`);

      return (): void => {
        log.push(`dispose:${panelId}`);
        element.textContent = "";
      };
    };

    // A persisted layout with rates and analytics TABBED into one group
    // (the outcome of a drag-dock) beside the blotter — two tabs, one
    // actions slot, so the slot has an active panel to follow.
    opts.blob = JSON.stringify(twoTabGroupLayout());
    const engine = createDockEngine(opts);

    const slots = [...opts.container.querySelectorAll(".rtc-dock-actions")];
    expect(slots).toHaveLength(2);
    expect(
      slots.map((slot) => {
        return slot.textContent;
      }),
    ).toEqual(expect.arrayContaining(["CTRL:fx-rates", "CTRL:fx-blotter"]));
    // Never the hidden tab's controls — one panel's controls per slot.
    expect(log).toEqual(
      expect.arrayContaining(["mount:fx-rates", "mount:fx-blotter"]),
    );
    expect(log).not.toContain("mount:fx-analytics");

    // Activate the analytics tab the way a user does (dockview activates a
    // panel on pointerdown over its tab): the shared slot must now show
    // analytics' controls, with rates' mount disposed first.
    const analyticsTab = tabOf(
      opts.container,
      opts.panels.title("fx-analytics"),
    );
    analyticsTab.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    const sharedSlot = analyticsTab
      .closest(".dv-groupview")
      ?.querySelector(".rtc-dock-actions");
    expect(sharedSlot?.textContent).toBe("CTRL:fx-analytics");
    expect(log.indexOf("dispose:fx-rates")).toBeLessThan(
      log.indexOf("mount:fx-analytics"),
    );

    engine.dispose();
  });

  it("renders no actions slot at all when the client supplies no mountActions", () => {
    const opts = base();
    const engine = createDockEngine(opts);
    expect(opts.container.querySelector(".rtc-dock-actions")).toBeNull();
    engine.dispose();
  });

  it("separates groups by the in-house 7px gutter through the theme gap", () => {
    const opts = base();
    const engine = createDockEngine(opts);
    // dockview flags a split view that carries a margin; the rendered view
    // widths below (the proportions test) are what the gap subtracts from.
    expect(GROUP_GAP_PX).toBe(7);
    expect(
      opts.container.querySelector(".dv-splitview-has-margin"),
    ).not.toBeNull();
    engine.dispose();
  });

  it("renders no tab close action (panel close/reopen is out of v1 scope)", () => {
    const opts = base();
    const engine = createDockEngine(opts);

    // dockview's DEFAULT tab renderer always includes a `.dv-default-tab-action`
    // close (×) button; the engine supplies TitleOnlyTab via
    // `createTabComponent` instead, so the close-action element must never
    // exist in the DOM at all (not merely be hidden by CSS).
    expect(opts.container.querySelector(".dv-default-tab-action")).toBeNull();
    engine.dispose();
  });

  it("routes the HUD theme class onto dockview's own internal shell element", () => {
    // Regression pin (visual-tier finding, task-7 report): dockview's own
    // built-in themes (themeDark, themeAbyss, …) apply their `className` via
    // the `theme` OPTION, which lands the class on dockview's internal
    // "shell" element — the closest ancestor of `.dv-dockview` — NOT on
    // whatever element the consumer's own container div carries. CSS custom
    // properties resolve from the nearest ancestor with an explicit
    // declaration, not by selector specificity, so a `dockview-theme-rtc`
    // class applied only to an OUTER wrapper div (as the client shells do,
    // for other styling) sits further from `.dv-dockview` than dockview's
    // own internal shell — and loses to dockview's default `themeAbyss`
    // colours regardless of skin/mode. This test pins the mechanism, not the
    // pixels (that's the playwright visual tier's job): the theme class must
    // land on an element INSIDE the container that createDockEngine did not
    // itself create — i.e. on dockview's own shell, not merely on the
    // consumer-supplied container.
    const opts = base();
    const engine = createDockEngine(opts);

    const themedDescendant = opts.container.querySelector(
      ".dockview-theme-rtc",
    );
    expect(themedDescendant).not.toBeNull();
    expect(themedDescendant).not.toBe(opts.container);

    engine.dispose();
  });

  it("honours the seed's proportions rather than distributing evenly", () => {
    // Regression pin (live-browser finding): without an explicit, real-
    // dimensioned `api.layout(width, height)` call before `fromJSON`,
    // dockview-core's freshly-constructed grid is still at its 0×0
    // construction size, and every SplitView falls back to distributing
    // space EVENLY among children — see the identical root-cause comment on
    // createDockEngine's own `api.layout()` call, and the raw dockview-core
    // round trip pinned in dockSeed.test.ts.
    const container = document.createElement("div");
    document.body.appendChild(container);
    attachedContainers.push(container);

    const engine = createDockEngine({
      container,
      seed: {
        kind: "split",
        dir: "row",
        sizes: [0.73, 0.27],
        children: [
          { kind: "panel", panelId: "left" },
          { kind: "panel", panelId: "right" },
        ],
      },
      blob: null,
      panels: {
        title: (id: string) => {
          return id;
        },
        mount: () => {
          return () => {};
        },
      },
      onLayoutChange: () => {},
      debounceMs: 0,
    });

    // dockview-core drives sizing by setting each grid view's pixel width
    // directly as an inline style (splitview.js: `view.container.style.width`),
    // not via CSS layout — so it's readable in jsdom without a real layout
    // engine. dockview wraps the deserialized tree in its own top-level
    // scaffold views (the grid always self-wraps, contributing extra
    // `.dv-view` elements at other widths/heights), so assert the two
    // EXPECTED leaf widths are present rather than the exact element count.
    const viewWidths = Array.from(
      container.querySelectorAll<HTMLElement>(".dv-view"),
    )
      .map((v) => {
        return Number.parseInt(v.style.width, 10);
      })
      .filter((w) => {
        return !Number.isNaN(w);
      });

    // jsdom containers always measure 0×0, so createDockEngine's fallback
    // extent (1200×800) applies. The theme gap (GROUP_GAP_PX) comes out of
    // the RENDERED extent first — the seed describes what the user sees —
    // so the split is 0.73 / 0.27 of 1200 − 7 = 1193: 871 and 322. dockview
    // floors half-pixel sizes on the way through, hence the ±1 tolerance.
    // Also assert against the even-50/50 collapse this test regresses on.
    const rendered = 1200 - GROUP_GAP_PX;
    const main = Math.round(0.73 * rendered);
    expect(viewWidths).toContainEqual(within(main, 1));
    expect(viewWidths).toContainEqual(within(rendered - main, 1));
    expect(viewWidths).not.toContain(600);

    engine.dispose();
  });

  it("coalesces two rapid layout mutations into a single onLayoutChange call", async () => {
    const calls: string[] = [];
    const engine = createDockEngine({
      ...base(),
      debounceMs: 30,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });

    // Each mutation's onDidLayoutChange notification is itself microtask-
    // deferred by dockview-core (AsapEvent), so a bare `await Promise.resolve()`
    // after each call is enough to let it reach our debounce layer — one
    // microtask hop, no fake timers needed.
    engine.maximizePanel("fx-rates");
    await Promise.resolve();
    engine.exitMaximize();
    await Promise.resolve();

    // Both mutations landed inside the same 30ms debounce window: the second
    // notification must have cancelled the first mutation's pending timer and
    // armed a fresh one, so nothing has fired yet.
    expect(calls).toHaveLength(0);

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(calls).toHaveLength(1); // exactly one save for the two mutations

    engine.dispose(); // dispose's own unconditional flush — a second, separate call
    expect(calls).toHaveLength(2);
  });
});

describe("collapse / expand", () => {
  it("strips a collapsed panel's group to the 38px bar", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });

    engine.collapsePanel("fx-analytics");

    // 0.25 of the 1200px fallback width before, the strip after.
    await waitForSize(seen, "fx-analytics", STRIP);
    expect(seen.sizeOf("fx-analytics")).toBe(STRIP);
    engine.dispose();
  });

  it("restores the exact pre-collapse size on expand", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const before = baselineSize(base(), "fx-analytics");

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);

    engine.expandPanel("fx-analytics");

    // Not merely "wider than the strip" — the SAME width it had before, which
    // is what separates restoring from letting the splitview redistribute.
    await waitForSize(seen, "fx-analytics", before);
    expect(seen.sizeOf("fx-analytics")).toBe(before);
    engine.dispose();
  });

  it("is idempotent — a second collapse cannot overwrite the remembered size", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const before = baselineSize(base(), "fx-analytics");

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    // Without the `preCollapse.has` guard this second call would record the
    // STRIP width as "pre-collapse", and expand would restore it to a strip.
    engine.collapsePanel("fx-analytics");
    engine.expandPanel("fx-analytics");

    await waitForSize(seen, "fx-analytics", before);
    expect(seen.sizeOf("fx-analytics")).toBe(before);
    engine.dispose();
  });

  it("strips a panel whose siblings STACK to the 32px horizontal bar instead", async () => {
    // fx-blotter sits under fx-rates in FX_LIKE's column split: it reclaims
    // HEIGHT, so the strip is the in-house short full-width bar — and the
    // bridge is told so, to render the matching horizontal restore bar.
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...base(),
      ...seen.options,
      ...strips.options,
    });

    engine.collapsePanel("fx-blotter");
    expect(strips.last).toEqual({ "fx-blotter": "horizontal" });

    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    expect(seen.sizeOf("fx-blotter")).toBe(STRIP_HEIGHT);
    engine.dispose();
  });

  it("restores a height-stripped panel to its exact pre-collapse height", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const before = baselineSize(base(), "fx-blotter");

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    engine.expandPanel("fx-blotter");

    await waitForSize(seen, "fx-blotter", before);
    expect(seen.sizeOf("fx-blotter")).toBe(before);
    engine.dispose();
  });

  it("reports the vertical orientation for a side-by-side sibling through onStripsChange — once, not again on a repeat call or an unknown id", () => {
    const strips = recordStrips();
    const engine = createDockEngine({ ...base(), ...strips.options });

    engine.collapsePanel("fx-analytics");
    expect(strips.last).toEqual({ "fx-analytics": "vertical" });
    expect(strips.calls).toBe(1);

    engine.collapsePanel("fx-analytics");
    engine.collapsePanel("nope");
    expect(strips.calls).toBe(1);

    engine.expandPanel("fx-analytics");
    expect(strips.last).toEqual({});
    expect(strips.calls).toBe(2);
    engine.dispose();
  });

  it("ignores expand for a panel this engine never collapsed", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });

    engine.expandPanel("fx-analytics");

    // The ONLY fixed wait in this block, and correct here: this asserts an
    // ABSENCE, so there is no condition to poll for — it must simply outlast
    // the save path it claims never runs. Sized well above the engine's
    // debounce (0ms here) plus dockview's microtask-deferred notification.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // No layout mutation at all — an unguarded expand would have called
    // setConstraints/setSize and produced a save.
    expect(seen.saves).toBe(0);
    engine.dispose();
  });

  it("ignores an unknown panel id", () => {
    const engine = createDockEngine(base());

    expect(() => {
      engine.collapsePanel("nope");
      engine.expandPanel("nope");
    }).not.toThrow();
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });
});

const STRIP = 32;
const STRIP_HEIGHT = 32;

/** An asymmetric matcher for `target ± tolerance` — dockview floors the
 * half-pixel sizes the theme gap produces, so an exact integer would be
 * asserting the flooring rule rather than the layout. */
describe("a fully-stripped column (the in-house stripDir rule)", () => {
  // FX_LIKE's left column stacks fx-rates over fx-blotter beside the
  // fx-analytics rail. One of the two collapsed reclaims DOWN the column (a
  // horizontal bar); once both are strips the column has nothing left to
  // reclaim along, so it reclaims SIDEWAYS in the row — both strips read
  // vertical, the column hugs 38px, and the strips share its height.
  it("flips both strips vertical when the last panel of the column collapses, and back when one expands", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...base(),
      ...seen.options,
      ...strips.options,
    });
    const columnBefore = baselineBranchSize(base(), "fx-rates");
    const ratesBefore = baselineSize(base(), "fx-rates");
    const blotterBefore = baselineSize(base(), "fx-blotter");

    engine.collapsePanel("fx-rates");
    expect(strips.last).toEqual({ "fx-rates": "horizontal" });
    await waitForSize(seen, "fx-rates", STRIP_HEIGHT);

    engine.collapsePanel("fx-blotter");
    expect(strips.last).toEqual({
      "fx-rates": "vertical",
      "fx-blotter": "vertical",
    });
    await waitForBranchSize(seen, "fx-rates", STRIP);
    // The strips share the column's height rather than keeping one 32px bar
    // beside a full-height one: the 800px fallback less the gap, halved.
    expect(seen.sizeOf("fx-rates")).toEqual(within(396, 2));
    expect(seen.sizeOf("fx-blotter")).toEqual(within(396, 2));

    engine.expandPanel("fx-blotter");
    expect(strips.last).toEqual({ "fx-rates": "horizontal" });
    // The column gets its width back and the survivor its 32px bar; the
    // expanded panel fills the rest of the column (800 − gap − bar), as
    // in-house — its own pre-collapse height only means something once its
    // sibling is back too.
    await waitForBranchSize(seen, "fx-rates", columnBefore);
    await waitForSize(seen, "fx-rates", STRIP_HEIGHT);
    await waitForSize(seen, "fx-blotter", 800 - GROUP_GAP_PX - STRIP_HEIGHT);

    engine.expandPanel("fx-rates");
    expect(strips.last).toEqual({});
    // ±1: the column's width restore and the two height restores each pass
    // through dockview's integer model once more than a plain expand does.
    await waitForSizeWithin(seen, "fx-rates", ratesBefore, 1);
    await waitForSizeWithin(seen, "fx-blotter", blotterBefore, 1);
    engine.dispose();
  });

  it("restores both panels when they expand in the order they collapsed", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const ratesBefore = baselineSize(base(), "fx-rates");
    const blotterBefore = baselineSize(base(), "fx-blotter");

    engine.collapsePanel("fx-rates");
    await waitForSize(seen, "fx-rates", STRIP_HEIGHT);
    engine.collapsePanel("fx-blotter");
    await waitForBranchSize(seen, "fx-rates", STRIP);

    // Expand in COLLAPSE order — the mirror of the test above. fx-rates's
    // record is genuine, but fx-blotter collapsed while fx-rates was already
    // a bar, so its group had absorbed fx-rates's space. Remembering that
    // inflated size and restoring it LAST used to take the space back out of
    // fx-rates all over again, shoving it to dockview's ~100px default
    // minimum instead of its pre-collapse height.
    engine.expandPanel("fx-rates");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);

    engine.expandPanel("fx-blotter");
    await waitForSizeWithin(seen, "fx-rates", ratesBefore, 2);
    await waitForSizeWithin(seen, "fx-blotter", blotterBefore, 2);
    engine.dispose();
  });

  it("recovers all three panels of a stacked column expanded in collapse order", async () => {
    // Three stacked siblings compound the borrowing: st-mid collapses while
    // st-top's bar's space sits on it, st-low while both bars' does — and on
    // the way back out, dockview moves each restore's delta to/from whichever
    // neighbours its splitview favours, not the panel holding the surplus.
    // Only the pre-strip world's put-back can land ALL THREE exactly; a
    // per-panel restore alone provably cannot, whatever it remembers.
    const stack = {
      kind: "split",
      dir: "row",
      sizes: [0.75, 0.25],
      children: [
        {
          kind: "split",
          dir: "column",
          sizes: [0.4, 0.35, 0.25],
          children: [
            { kind: "panel", panelId: "st-top" },
            { kind: "panel", panelId: "st-mid" },
            { kind: "panel", panelId: "st-low" },
          ],
        },
        { kind: "panel", panelId: "st-side" },
      ],
    } as const;
    const opts = { ...base(), seed: stack };
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    const before = baselines({ ...base(), seed: stack }, [
      "st-top",
      "st-mid",
      "st-low",
    ]);

    // A 3-child branch's gap share is 7 × 2⁄3 — the bars read at repeating
    // decimals, so every wait here tolerates the float, not just the last.
    engine.collapsePanel("st-top");
    await waitForSizeWithin(seen, "st-top", STRIP_HEIGHT, 1);
    engine.collapsePanel("st-mid");
    await waitForSizeWithin(seen, "st-mid", STRIP_HEIGHT, 1);
    engine.collapsePanel("st-low");
    await waitForBranchSize(seen, "st-top", STRIP);

    engine.expandPanel("st-top");
    await waitForSizeWithin(seen, "st-mid", STRIP_HEIGHT, 1);
    engine.expandPanel("st-mid");
    engine.expandPanel("st-low");

    for (const panelId of ["st-top", "st-mid", "st-low"]) {
      await waitForSizeWithin(seen, panelId, before.get(panelId) ?? 0, 2);
    }

    engine.dispose();
  });

  it("reads every strip against the row when the whole dock is stripped", () => {
    const strips = recordStrips();
    const engine = createDockEngine({ ...base(), ...strips.options });

    engine.collapsePanel("fx-analytics");
    engine.collapsePanel("fx-rates");
    engine.collapsePanel("fx-blotter");
    expect(strips.last).toEqual({
      "fx-analytics": "vertical",
      "fx-rates": "vertical",
      "fx-blotter": "vertical",
    });
    engine.dispose();
  });
});

describe("maximize (the in-house boundary policy)", () => {
  // In-house, maximize strips every leaf under the maximize BOUNDARY except
  // the maximized panel — the whole dock, or a "nearest-column" panel's own
  // column. Dockview's native maximize hides siblings and has no scope, so
  // the engine emulates the policy over its strip machinery instead; these
  // pin that the result IS the in-house one: same strips, same orientations,
  // the maximized panel filling what they free, and an exact restore.
  const FILL = 800 - GROUP_GAP_PX - STRIP_HEIGHT;

  it("root scope: strips every other panel, the rail flipping vertical, and restores each exactly", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...railBase(),
      ...seen.options,
      ...strips.options,
    });

    const before = baselines(railBase(), [
      "fx-rates",
      "fx-blotter",
      "fx-analytics",
      "fx-positions",
    ]);
    const railBefore = baselineBranchSize(railBase(), "fx-analytics");

    engine.maximizePanel("fx-rates");
    // Blotter reclaims down its column (rates still fills it); the rail has
    // nothing left unstripped, so it reclaims sideways — the stripDir rule.
    expect(strips.last).toEqual({
      "fx-blotter": "horizontal",
      "fx-analytics": "vertical",
      "fx-positions": "vertical",
    });
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    await waitForBranchSize(seen, "fx-analytics", STRIP);
    // The maximized panel takes everything the strips freed in its column.
    await waitForSize(seen, "fx-rates", FILL);
    expect(engine.groupCount()).toBe(4);

    engine.exitMaximize();
    expect(strips.last).toEqual({});
    await waitForBranchSize(seen, "fx-analytics", railBefore);

    for (const [panelId, size] of before) {
      await waitForSizeWithin(seen, panelId, size, 1);
    }

    engine.dispose();
  });

  it("nearest-column scope: strips only the rail sibling, leaving the main column untouched", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...railBase(),
      ...seen.options,
      ...strips.options,
    });
    const before = baselines(railBase(), ["fx-rates", "fx-blotter"]);
    const positionsBefore = baselineSize(railBase(), "fx-positions");
    const railBefore = baselineBranchSize(railBase(), "fx-analytics");

    engine.maximizePanel("fx-analytics");
    expect(strips.last).toEqual({ "fx-positions": "horizontal" });
    await waitForSize(seen, "fx-positions", STRIP_HEIGHT);
    await waitForSize(seen, "fx-analytics", FILL);
    // Outside the boundary nothing moved: the main column's panels and the
    // rail's own width read exactly as before.
    expect(seen.sizeOf("fx-rates")).toBe(before.get("fx-rates"));
    expect(seen.sizeOf("fx-blotter")).toBe(before.get("fx-blotter"));
    expect(seen.branchSizeOf("fx-analytics")).toBe(railBefore);

    engine.exitMaximize();
    expect(strips.last).toEqual({});
    await waitForSize(seen, "fx-positions", positionsBefore);
    engine.dispose();
  });

  it("falls back to the whole dock for a nearest-column panel with no column ancestor", () => {
    // FX_LIKE's analytics is a lone leaf in the root row — maximizeBoundaryPath
    // returns the root for it, and so does the engine.
    const strips = recordStrips();
    const engine = createDockEngine({
      ...base(),
      ...strips.options,
      panels: { ...base().panels, maximizeScope: railScope },
    });

    engine.maximizePanel("fx-analytics");
    expect(strips.last).toEqual({
      "fx-rates": "vertical",
      "fx-blotter": "vertical",
    });
    engine.dispose();
  });

  it("leaves a strip the user collapsed beforehand in place after restore", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...railBase(),
      ...seen.options,
      ...strips.options,
    });

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    engine.maximizePanel("fx-rates");
    engine.exitMaximize();

    // The maximize did not own blotter's strip, so restore did not touch it.
    expect(strips.last).toEqual({ "fx-blotter": "horizontal" });
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    expect(seen.sizeOf("fx-blotter")).toBe(STRIP_HEIGHT);
    engine.dispose();
  });

  it("hands a maximize-forced strip to the user when it is collapsed meanwhile", () => {
    const strips = recordStrips();
    const engine = createDockEngine({ ...railBase(), ...strips.options });

    engine.maximizePanel("fx-rates");
    const callsAfterMaximize = strips.calls;
    engine.collapsePanel("fx-blotter"); // already a strip: nothing moves…
    expect(strips.calls).toBe(callsAfterMaximize);

    engine.exitMaximize(); // …but it now outlives the maximize, as in-house
    expect(strips.last).toEqual({ "fx-blotter": "horizontal" });
    engine.dispose();
  });

  it("switches from one maximized panel to another, restoring the first's strips fully first", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...railBase(),
      ...seen.options,
      ...strips.options,
    });

    const before = baselines(railBase(), [
      "fx-rates",
      "fx-blotter",
      "fx-analytics",
      "fx-positions",
    ]);

    engine.maximizePanel("fx-rates");
    engine.maximizePanel("fx-blotter");
    expect(strips.last).toEqual({
      "fx-rates": "horizontal",
      "fx-analytics": "vertical",
      "fx-positions": "vertical",
    });
    await waitForSize(seen, "fx-blotter", FILL);

    engine.exitMaximize();

    // Had the switch re-recorded analytics/positions while they were bars,
    // this restore would put them back AS bars.
    for (const [panelId, size] of before) {
      await waitForSizeWithin(seen, panelId, size, 1);
    }

    engine.dispose();
  });

  it("is idempotent and ignores an unknown panel", () => {
    const strips = recordStrips();
    const opts = { ...railBase(), ...strips.options };
    const engine = createDockEngine(opts);

    engine.maximizePanel("nope");
    expect(strips.calls).toBe(0);
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);

    engine.maximizePanel("fx-rates");
    engine.maximizePanel("fx-rates");
    expect(strips.calls).toBe(1);
    engine.dispose();
  });
});

describe("glide marker", () => {
  // The stylesheet transitions dockview's inline geometry only while the
  // container carries the marker; the engine owns its lifetime around the
  // four intents so drags and resizes (which rewrite the same inline styles)
  // never animate — the in-house engine's "not while dragging" rule, inverted.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is absent after mount — a fresh dock lays out instantly", () => {
    const opts = base();
    const engine = createDockEngine(opts);

    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    engine.dispose();
  });

  it("wraps every intent and clears itself once the transition has run", () => {
    vi.useFakeTimers();
    const opts = base();
    const engine = createDockEngine(opts);
    const intents: ReadonlyArray<() => void> = [
      (): void => {
        engine.collapsePanel("fx-analytics");
      },
      (): void => {
        engine.expandPanel("fx-analytics");
      },
      (): void => {
        engine.maximizePanel("fx-rates");
      },
      (): void => {
        engine.exitMaximize();
      },
    ];

    for (const intent of intents) {
      intent();
      expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(true);
      vi.advanceTimersByTime(GLIDE_ATTRIBUTE_MS - 1);
      expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    }

    engine.dispose();
  });

  it("outlives the in-house 0.34s glide so the transition's tail is never cut off", () => {
    expect(GLIDE_ATTRIBUTE_MS).toBeGreaterThan(340);
  });

  it("does not mark a no-op exitMaximize (nothing is maximized, nothing moves)", () => {
    const opts = base();
    const engine = createDockEngine(opts);

    engine.exitMaximize();
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    engine.dispose();
  });

  it("restarts the clock on a second intent mid-glide instead of cutting the first short", () => {
    vi.useFakeTimers();
    const opts = base();
    const engine = createDockEngine(opts);

    engine.collapsePanel("fx-analytics");
    vi.advanceTimersByTime(GLIDE_ATTRIBUTE_MS - 50);
    engine.expandPanel("fx-analytics");
    vi.advanceTimersByTime(50);
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(true);
    vi.advanceTimersByTime(GLIDE_ATTRIBUTE_MS - 50);
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    engine.dispose();
  });

  it("dispose mid-glide drops the marker and its timer", () => {
    vi.useFakeTimers();
    const opts = base();
    const engine = createDockEngine(opts);

    engine.collapsePanel("fx-analytics");
    engine.dispose();
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);

    // The clear-down timer went with it: a marker planted after dispose is
    // not swept by a stale one (dockview keeps timers of its own, so the
    // global timer count is not the witness here).
    opts.container.setAttribute(DOCK_GLIDE_ATTRIBUTE, "");
    vi.advanceTimersByTime(GLIDE_ATTRIBUTE_MS * 2);
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(true);
  });
});

describe("design-width pins (the in-house initialPx semantics)", () => {
  const RAIL_PIN = {
    panelIds: ["fx-analytics", "fx-positions"],
    px: 360,
    axis: "width",
  };

  it("opens the rail at its design width and persists the pin in the blob", () => {
    const seen = trackLayout();
    createDockEngine({ ...railPinnedBase(), ...seen.options }).dispose();

    expect(seen.branchSizeOf("fx-analytics")).toEqual(within(360, 1));
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("pins a lone panel child too, not just a rail split", () => {
    const seen = trackLayout();
    createDockEngine({
      ...base(),
      ...seen.options,
      seed: { ...FX_LIKE, initialPx: [undefined, 360] },
    }).dispose();

    expect(seen.sizeOf("fx-analytics")).toEqual(within(360, 1));
    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics"], px: 360, axis: "width" },
    ]);
  });

  it("restores the design width after the whole rail strips and expands", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...railPinnedBase(), ...seen.options });

    engine.collapsePanel("fx-analytics");
    engine.collapsePanel("fx-positions");
    await waitForBranchSize(seen, "fx-analytics", STRIP);
    engine.expandPanel("fx-analytics");
    engine.expandPanel("fx-positions");
    await waitForBranchSize(seen, "fx-analytics", 360);
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("restores both rail panels' heights when they expand in collapse order", async () => {
    // The width restore above passes even while the HEIGHTS land wrong — the
    // second-expanded panel's record was captured after the first strip had
    // handed it its space. The pin must neither mask nor break the fix: this
    // is the user-visible FX-rail sequence, pin held throughout.
    const seen = trackLayout();
    const engine = createDockEngine({ ...railPinnedBase(), ...seen.options });
    const analyticsBefore = baselineSize(railPinnedBase(), "fx-analytics");
    const positionsBefore = baselineSize(railPinnedBase(), "fx-positions");

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP_HEIGHT);
    engine.collapsePanel("fx-positions");
    await waitForBranchSize(seen, "fx-analytics", STRIP);

    engine.expandPanel("fx-analytics");
    await waitForSize(seen, "fx-positions", STRIP_HEIGHT);

    engine.expandPanel("fx-positions");
    await waitForSizeWithin(seen, "fx-analytics", analyticsBefore, 2);
    await waitForSizeWithin(seen, "fx-positions", positionsBefore, 2);
    await waitForBranchSize(seen, "fx-analytics", 360);
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("releases the pin on a sash drag in the declaring split", () => {
    const opts = railPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    dragSash(opts.container, ".dv-horizontal");
    engine.dispose();
    expect(seen.pins()).toEqual([]);
  });

  it("keeps the pin on a grab that never moves", () => {
    const opts = railPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    grabSash(opts.container, ".dv-horizontal");
    window.dispatchEvent(new Event("pointerup"));
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("leaves the rail pin alone when the drag is in a nested split", () => {
    const opts = railPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    dragSash(opts.container, ".dv-vertical");
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("re-applies a still-pinned blob's pin on the next load", () => {
    const opts = railPinnedBase();
    const seen = trackLayout();
    createDockEngine({ ...opts, ...seen.options }).dispose();

    const reloaded = trackLayout();
    createDockEngine({
      ...railPinnedBase(),
      ...reloaded.options,
      blob: seen.blob(),
    }).dispose();

    expect(reloaded.pins()).toEqual([RAIL_PIN]);
    expect(reloaded.branchSizeOf("fx-analytics")).toEqual(within(360, 1));
  });

  it("keeps a released pin released across reloads", () => {
    const opts = railPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    dragSash(opts.container, ".dv-horizontal");
    engine.dispose();

    const reloaded = trackLayout();
    createDockEngine({
      ...railPinnedBase(),
      ...reloaded.options,
      blob: seen.blob(),
    }).dispose();

    expect(reloaded.pins()).toEqual([]);
  });

  it("treats a legacy blob without the sidecar as unpinned", () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...railPinnedBase(), ...seen.options });
    first.dispose();
    const legacy: Record<string, unknown> = JSON.parse(seen.blob());
    delete legacy.rtcDesignPins;

    const reloaded = trackLayout();
    createDockEngine({
      ...railPinnedBase(),
      ...reloaded.options,
      blob: JSON.stringify(legacy),
    }).dispose();

    expect(reloaded.pins()).toEqual([]);
  });

  it("drops a pin whose panels no longer fill their groups exactly", () => {
    // A blob whose analytics tab was drag-docked beside rates: the pin's
    // clamp would hold the rates group too, so it must dissolve instead.
    const seen = trackLayout();
    createDockEngine({
      ...base(),
      ...seen.options,
      blob: JSON.stringify({
        ...(twoTabGroupLayout() as Record<string, unknown>),
        rtcDesignPins: [{ panelIds: ["fx-analytics"], px: 360, axis: "width" }],
      }),
    }).dispose();

    expect(seen.pins()).toEqual([]);
  });

  /** Grabs the first sash of the first split matching `splitSelector` —
   * dockview's real pointer-drag entry — without moving it. */
  function grabSash(container: HTMLElement, splitSelector: string): void {
    const sash = container.querySelector(
      `${splitSelector} > .dv-sash-container > .dv-sash`,
    );

    if (sash === null) {
      throw new Error(`no sash under ${splitSelector}`);
    }

    sash.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  }

  function dragSash(container: HTMLElement, splitSelector: string): void {
    grabSash(container, splitSelector);
    window.dispatchEvent(new Event("pointermove"));
    window.dispatchEvent(new Event("pointerup"));
  }

  function railPinnedBase(): DockEngineOptions {
    return {
      ...railBase(),
      seed: { ...RAIL_LIKE, initialPx: [undefined, 360] },
    };
  }
});

describe("reload with strips (the blob's rtcStripGeometry sidecar)", () => {
  // The blob serialises the layout AS RENDERED — a collapsed panel's group is
  // in it at the bar size. Reloading such a blob restores the tiny group (at
  // dockview's own ~100px default minimum), and when the bridge re-applies
  // the machine's persisted "collapsed", a bare recordStrip would remember
  // THAT clamped size as the one to restore: the first expand after a reload
  // landed at ~100px instead of the true pre-collapse size. The sidecar
  // carries each strip's pre-collapse size (and a flipped split's pre-flip
  // width) across the reload, and recordStrip seeds from it.
  it("restores the pre-collapse width when expanding after a reload", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options });
    const before = baselineSize(base(), "fx-analytics");

    first.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: seen.blob(),
    });
    // The bridge re-applies the machine's persisted "collapsed" on mount.
    second.collapsePanel("fx-analytics");
    await waitForSize(reloaded, "fx-analytics", STRIP);

    second.expandPanel("fx-analytics");
    await waitForSizeWithin(reloaded, "fx-analytics", before, 1);
    second.dispose();
  });

  it("writes each strip's pre-collapse size into the sidecar", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const before = baselineSize(base(), "fx-analytics");

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    engine.dispose();

    const sidecar = JSON.parse(seen.blob()).rtcStripGeometry;
    expect(sidecar.records["fx-analytics"].size).toEqual(within(before, 1));
  });

  it("restores a fully-stripped column across a reload — its width and both heights", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options });
    const columnBefore = baselineBranchSize(base(), "fx-rates");
    const ratesBefore = baselineSize(base(), "fx-rates");
    const blotterBefore = baselineSize(base(), "fx-blotter");

    first.collapsePanel("fx-rates");
    first.collapsePanel("fx-blotter");
    await waitForBranchSize(seen, "fx-rates", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: seen.blob(),
    });
    second.collapsePanel("fx-rates");
    second.collapsePanel("fx-blotter");
    await waitForBranchSize(reloaded, "fx-rates", STRIP);

    // Same expand order and expectations as the fresh-session stripDir test:
    // the first expand puts the column's pre-flip width back (the sidecar's
    // flip entry — a witness measured NOW would read the bar), the second
    // restores both heights.
    second.expandPanel("fx-blotter");
    await waitForBranchSize(reloaded, "fx-rates", columnBefore);
    second.expandPanel("fx-rates");
    await waitForSizeWithin(reloaded, "fx-rates", ratesBefore, 2);
    await waitForSizeWithin(reloaded, "fx-blotter", blotterBefore, 2);
    second.dispose();
  });

  it("restores a reloaded column expanded in collapse order — the seeded world composes with the put-back", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options });
    const ratesBefore = baselineSize(base(), "fx-rates");
    const blotterBefore = baselineSize(base(), "fx-blotter");

    first.collapsePanel("fx-rates");
    first.collapsePanel("fx-blotter");
    await waitForBranchSize(seen, "fx-rates", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: seen.blob(),
    });
    second.collapsePanel("fx-rates");
    second.collapsePanel("fx-blotter");
    await waitForBranchSize(reloaded, "fx-rates", STRIP);

    // Collapse-order expansion is the order the overshoot fix exists for: the
    // last expand's world put-back must re-assert the SIDECAR-seeded sizes,
    // not the restored grid's bar-polluted snapshot.
    second.expandPanel("fx-rates");
    second.expandPanel("fx-blotter");
    await waitForSizeWithin(reloaded, "fx-rates", ratesBefore, 2);
    await waitForSizeWithin(reloaded, "fx-blotter", blotterBefore, 2);
    second.dispose();
  });

  it("loads a legacy blob without the sidecar and still collapses/expands", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options });
    first.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    first.dispose();
    const legacy: Record<string, unknown> = JSON.parse(seen.blob());
    delete legacy.rtcStripGeometry;

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: JSON.stringify(legacy),
    });
    expect(second.groupCount()).toBe(3);
    second.collapsePanel("fx-analytics");
    await waitForSize(reloaded, "fx-analytics", STRIP);
    expect(() => {
      second.expandPanel("fx-analytics");
    }).not.toThrow();
    second.dispose();
  });

  it("drops a malformed sidecar instead of trusting it", async () => {
    const seen = trackLayout();
    createDockEngine({ ...base(), ...seen.options }).dispose();
    const tampered: Record<string, unknown> = JSON.parse(seen.blob());
    tampered.rtcStripGeometry = {
      records: { "fx-analytics": { size: "wide" } },
      flips: "nope",
    };

    const reloaded = trackLayout();
    const engine = createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: JSON.stringify(tampered),
    });
    engine.collapsePanel("fx-analytics");
    await waitForSize(reloaded, "fx-analytics", STRIP);
    engine.dispose();
  });

  it("keeps a strip-free blob free of the sidecar and stable across a reload", () => {
    const seen = trackLayout();
    createDockEngine({ ...base(), ...seen.options }).dispose();
    expect(JSON.parse(seen.blob()).rtcStripGeometry).toBeUndefined();

    const reloaded = trackLayout();
    createDockEngine({
      ...base(),
      ...reloaded.options,
      blob: seen.blob(),
    }).dispose();
    expect(reloaded.blob()).toBe(seen.blob());
  });
});

function within(target: number, tolerance: number): unknown {
  return {
    asymmetricMatch: (actual: unknown): boolean => {
      return (
        typeof actual === "number" && Math.abs(actual - target) <= tolerance
      );
    },
    toString: (): string => {
      return `within(${target} ± ${tolerance})`;
    },
  };
}

/** The size a panel's group RENDERS at on a fresh engine built from `opts`,
 * read from the serialisation a throwaway twin flushes on dispose. The
 * engine under test has not fired onDidLayoutChange yet at that point, and
 * no intent is a no-op it could be forced through (maximize/exit used to be,
 * before maximize stripped siblings for real); jsdom sizes every container
 * identically, so the twin lays out exactly as the live engine did. With the
 * theme gap in force this is a little under the nominal fraction (0.25 × 1200
 * minus the gap share) — why the collapse tests capture it rather than
 * hardcode 300. */
function baselineSize(opts: DockEngineOptions, panelId: string): number {
  const size = baseline(opts).sizeOf(panelId);

  if (size === null) {
    throw new Error(`${panelId} has no rendered size on a fresh engine`);
  }

  return size;
}

function baselines(
  opts: DockEngineOptions,
  panelIds: readonly string[],
): ReadonlyMap<string, number> {
  const seen = baseline(opts);

  return new Map(
    panelIds.map((panelId) => {
      const size = seen.sizeOf(panelId);

      if (size === null) {
        throw new Error(`${panelId} has no rendered size on a fresh engine`);
      }

      return [panelId, size];
    }),
  );
}

/** {@link baselineSize} for the BRANCH holding `panelId`'s leaf — a
 * column's width inside the root row. */
function baselineBranchSize(opts: DockEngineOptions, panelId: string): number {
  const size = baseline(opts).branchSizeOf(panelId);

  if (size === null) {
    throw new Error(
      `${panelId}'s branch has no rendered size on a fresh engine`,
    );
  }

  return size;
}

function baseline(opts: DockEngineOptions): LayoutTracker {
  const seen = trackLayout();
  // dispose flushes one final serialisation synchronously — see the engine.
  createDockEngine({ ...opts, ...seen.options }).dispose();

  return seen;
}

/** Polls the persisted layout until `panelId`'s group reports `expected`px.
 *
 * This replaced a fixed `setTimeout(5)`, which reddened `main` once (run
 * 31806741355: `expected null to be 38` — the blob was still empty). Two
 * asynchronies stack before a size is readable: the engine's own save debounce
 * AND dockview's `onDidLayoutChange`, which is microtask-deferred via its
 * AsapEvent. 5ms cleared both on an idle laptop and lost on a loaded CI runner
 * — a fixed sleep racing an async signal, the same flake shape already
 * catalogued for the e2e tier. Poll the condition instead; the timeout message
 * carries the last value seen so a real regression still reads clearly. */
async function waitForSize(
  tracker: LayoutTracker,
  panelId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (tracker.sizeOf(panelId) === expected) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(
    `${panelId} never reached ${expected}px (last seen: ${tracker.sizeOf(panelId)}, saves: ${tracker.saves})`,
  );
}

/** Captures every persisted layout so a test can read the size dockview
 * actually recorded, rather than the DOM — jsdom never lays anything out. */
interface LayoutTracker {
  options: Pick<DockEngineOptions, "onLayoutChange" | "debounceMs">;
  saves: number;
  sizeOf(panelId: string): number | null;
  /** The rendered size of the BRANCH holding `panelId`'s leaf, on its own
   * parent's axis — a column's width inside a row. */
  branchSizeOf(panelId: string): number | null;
  /** The `rtcDesignPins` sidecar of the last save. */
  pins(): readonly unknown[];
  /** The last save, verbatim — what a reload would hand the next engine. */
  blob(): string;
}

interface StripsRecorder {
  options: Pick<DockEngineOptions, "onStripsChange">;
  last: DockStripMap;
  calls: number;
}

function recordStrips(): StripsRecorder {
  const recorder: StripsRecorder = {
    options: {
      onStripsChange: (next: DockStripMap): void => {
        recorder.last = next;
        recorder.calls += 1;
      },
    },
    last: {},
    calls: 0,
  };

  return recorder;
}

async function waitForSizeWithin(
  tracker: LayoutTracker,
  panelId: string,
  expected: number,
  tolerance: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const size = tracker.sizeOf(panelId);

    if (size !== null && Math.abs(size - expected) <= tolerance) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(
    `${panelId} never came within ${tolerance}px of ${expected}px (last seen: ${tracker.sizeOf(panelId)})`,
  );
}

async function waitForBranchSize(
  tracker: LayoutTracker,
  panelId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const size = tracker.branchSizeOf(panelId);

    if (size !== null && Math.abs(size - expected) <= 1) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(
    `${panelId}'s branch never reached ${expected}px (last seen: ${tracker.branchSizeOf(panelId)})`,
  );
}

function trackLayout(): LayoutTracker {
  let blob = "";
  const tracker = {
    options: {
      onLayoutChange: (next: string): void => {
        blob = next;
        tracker.saves += 1;
      },
      debounceMs: 0,
    },
    saves: 0,
    sizeOf: (panelId: string): number | null => {
      return blob === ""
        ? null
        : findLeafSize(JSON.parse(blob).grid.root, panelId);
    },
    branchSizeOf: (panelId: string): number | null => {
      return blob === ""
        ? null
        : findBranchSize(JSON.parse(blob).grid.root, panelId);
    },
    pins: (): readonly unknown[] => {
      return blob === "" ? [] : (JSON.parse(blob).rtcDesignPins ?? []);
    },
    blob: (): string => {
      return blob;
    },
  };

  return tracker;
}

/** The rendered size of the branch that directly holds `panelId`'s leaf, on
 * the axis of ITS parent — de-compensated like findLeafSize, at the parent's
 * child count. Null for a leaf sitting directly under the root. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function findBranchSize(root: any, panelId: string): number | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  function holdsLeaf(node: any): boolean {
    return node.type === "leaf" && (node.data?.views ?? []).includes(panelId);
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  function walk(parent: any): number | null {
    if (parent.type !== "branch") {
      return null;
    }

    const share =
      (GROUP_GAP_PX * (parent.data.length - 1)) / parent.data.length;

    for (const child of parent.data) {
      if (child.type === "branch" && child.data.some(holdsLeaf)) {
        return child.size - share;
      }

      const deeper = walk(child);

      if (deeper !== null) {
        return deeper;
      }
    }

    return null;
  }

  return walk(root);
}

/** The RENDERED size of `panelId`'s group, read back out of the persisted
 * blob. The blob carries MODEL sizes (createDockEngine serialises through
 * compensateGap so a save/load cycle is exact), and dockview renders each
 * of a branch's `n` children at `model − gap × (n − 1) / n` — so this
 * subtracts that share at the leaf's own branch, mirroring the layout. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function findLeafSize(node: any, panelId: string): number | null {
  if (node.type === "leaf") {
    return null;
  }

  const children: unknown[] = node.data ?? [];
  const share =
    (GROUP_GAP_PX * Math.max(0, children.length - 1)) / children.length;

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  for (const child of children as any[]) {
    if (child.type === "leaf" && child.data?.views?.includes(panelId)) {
      return child.size - share;
    }

    const hit = findLeafSize(child, panelId);

    if (hit !== null) {
      return hit;
    }
  }

  return null;
}

/** dockview's serialised form of FX_LIKE after analytics has been drag-
 * docked as a second tab into the rates group: [rates+analytics] over
 * blotter, in one column. */
function twoTabGroupLayout(): unknown {
  function panel(id: string): Record<string, string> {
    return { id, contentComponent: "rtc-panel", title: id };
  }

  return {
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            size: 480,
            data: {
              id: "g-top",
              views: ["fx-rates", "fx-analytics"],
              activeView: "fx-rates",
            },
          },
          {
            type: "leaf",
            size: 320,
            data: {
              id: "g-bottom",
              views: ["fx-blotter"],
              activeView: "fx-blotter",
            },
          },
        ],
      },
      width: 1200,
      height: 800,
      orientation: "VERTICAL",
    },
    panels: {
      "fx-rates": panel("fx-rates"),
      "fx-analytics": panel("fx-analytics"),
      "fx-blotter": panel("fx-blotter"),
    },
  };
}

/** The `.dv-tab` (dockview's own draggable wrapper) whose fallback title
 * label reads `title` — what `base()`'s title hook produced for the panel. */
function tabOf(container: HTMLElement, title: string): HTMLElement {
  const label = [...container.querySelectorAll(".rtc-dock-tab-title")].find(
    (el) => {
      return el.textContent === title;
    },
  );
  const tab = label?.closest(".dv-tab");

  if (!(tab instanceof HTMLElement)) {
    throw new Error(`no tab titled ${title}`);
  }

  return tab;
}

/** {@link base} over RAIL_LIKE, with the FX rail panels' real
 * `maximizeScope: "nearest-column"` supplied through the hook. */
function railBase(): DockEngineOptions {
  const opts = base();

  return {
    ...opts,
    seed: RAIL_LIKE,
    panels: { ...opts.panels, maximizeScope: railScope },
  };
}

function railScope(panelId: string): DockMaximizeScope {
  return panelId === "fx-analytics" || panelId === "fx-positions"
    ? "nearest-column"
    : "root";
}

function base(): DockEngineOptions {
  const container = document.createElement("div");
  document.body.appendChild(container);
  attachedContainers.push(container);
  return {
    container,
    seed: FX_LIKE,
    blob: null,
    panels: {
      title: (id: string) => {
        return id.toUpperCase();
      },
      mount: (_id: string, el: HTMLElement) => {
        el.textContent = `content:${_id}`;
        return () => {};
      },
    },
    onLayoutChange: () => {},
    debounceMs: 0,
  };
}
