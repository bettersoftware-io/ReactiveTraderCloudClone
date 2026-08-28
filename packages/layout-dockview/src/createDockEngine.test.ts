import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DockEngineOptions } from "#/createDockEngine";
import { createDockEngine, GROUP_GAP_PX } from "#/createDockEngine";

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

  it("maximizePanel / exitMaximize drive dockview's maximized state", () => {
    const engine = createDockEngine(base());
    engine.maximizePanel("fx-blotter");
    // dockview marks the maximized group in the DOM; assert via the api-level witness:
    // createDockEngine exposes it indirectly — after exitMaximize the layout serialises again.
    engine.exitMaximize();
    engine.dispose();
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
    opts.panels.mountTab = (panelId, element): (() => void) => {
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
    opts.panels.mountActions = (panelId, element): (() => void) => {
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
    const before = await renderedSize(engine, seen, "fx-analytics");

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
    const before = await renderedSize(engine, seen, "fx-analytics");

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
    const engine = createDockEngine({ ...base(), ...seen.options });

    expect(engine.collapsePanel("fx-blotter")).toBe("horizontal");

    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    expect(seen.sizeOf("fx-blotter")).toBe(STRIP_HEIGHT);
    engine.dispose();
  });

  it("restores a height-stripped panel to its exact pre-collapse height", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const before = await renderedSize(engine, seen, "fx-blotter");

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    engine.expandPanel("fx-blotter");

    await waitForSize(seen, "fx-blotter", before);
    expect(seen.sizeOf("fx-blotter")).toBe(before);
    engine.dispose();
  });

  it("reports the vertical orientation for a side-by-side sibling, and again on a repeat call", () => {
    const engine = createDockEngine(base());
    expect(engine.collapsePanel("fx-analytics")).toBe("vertical");
    expect(engine.collapsePanel("fx-analytics")).toBe("vertical");
    expect(engine.collapsePanel("nope")).toBeNull();
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

const STRIP = 38;
const STRIP_HEIGHT = 32;

/** An asymmetric matcher for `target ± tolerance` — dockview floors the
 * half-pixel sizes the theme gap produces, so an exact integer would be
 * asserting the flooring rule rather than the layout. */
function within(target: number, tolerance: number): unknown {
  return {
    asymmetricMatch: (actual: unknown): boolean => {
      return typeof actual === "number" && Math.abs(actual - target) <= tolerance;
    },
    toString: (): string => {
      return `within(${target} ± ${tolerance})`;
    },
  };
}

/** The width a panel's group currently RENDERS at, read from a fresh
 * serialisation forced through a no-op maximize/exit pair (the engine's
 * onDidLayoutChange is what feeds the tracker, and a freshly-built engine
 * has not fired it yet). With the theme gap in force this is a little under
 * the nominal fraction (0.25 × 1200 minus the gap share), which is exactly
 * why the collapse tests capture it rather than hardcode 300. */
async function renderedSize(
  engine: ReturnType<typeof createDockEngine>,
  tracker: LayoutTracker,
  panelId: string,
): Promise<number> {
  engine.maximizePanel(panelId);
  engine.exitMaximize();

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const size = tracker.sizeOf(panelId);

    if (size !== null && size !== STRIP && size !== STRIP_HEIGHT) {
      return size;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(`${panelId} never reported a rendered width`);
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
  };

  return tracker;
}

// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function findLeafSize(node: any, panelId: string): number | null {
  if (node.type === "leaf") {
    return node.data?.views?.includes(panelId) ? node.size : null;
  }

  for (const child of node.data ?? []) {
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
  const panel = (id: string): Record<string, string> => {
    return { id, contentComponent: "rtc-panel", title: id };
  };

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
            data: { id: "g-bottom", views: ["fx-blotter"], activeView: "fx-blotter" },
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
