import {
  createDockview,
  type DockviewApi,
  Orientation,
  type SerializedDockview,
} from "dockview";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  DockDynamicPanel,
  DockEngine,
  DockEngineOptions,
} from "#/createDockEngine";
import {
  createDockEngine,
  DOCK_GLIDE_ATTRIBUTE,
  type DockMaximizeScope,
  type DockStripMap,
  GLIDE_ATTRIBUTE_MS,
  GROUP_GAP_PX,
  loadBlobOrSeed,
  type RestoreTier,
} from "#/createDockEngine";

// jsdom (as of the pinned Node/jsdom combo here) has no ResizeObserver;
// dockview-core's own unit tests run under jsdom with a no-op stub. This one
// also RECORDS what each observer watches, so a test can deliver a resize to
// the engine's own container observer (see "settle resize") — everywhere else
// it behaves as the no-op did: nothing is ever delivered unprompted.
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global patch
    (globalThis as any).ResizeObserver = RecordingResizeObserver;
  }
});

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
    const engine = createDockEngine({ ...createBase(), blob: "{not json" });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("falls back to the seed on a structurally-invalid blob", () => {
    const engine = createDockEngine({
      ...createBase(),
      blob: JSON.stringify({ hello: 1 }),
    });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("restores a valid blob (round-trip through its own serialisation)", () => {
    let saved: string | null = null;
    const firstOpts = createBase();
    const first = createDockEngine({
      ...firstOpts,
      onLayoutChange: (blob: string) => {
        saved = blob;
      },
      debounceMs: 0,
    });
    touchContainer(firstOpts.container); // a user was here, so dispose persists
    first.maximizePanel("fx-rates"); // any layout mutation triggers serialisation
    first.dispose();
    expect(saved).not.toBeNull();

    const second = createDockEngine({ ...createBase(), blob: saved });
    expect(second.groupCount()).toBe(3);
    second.dispose();
  });

  it("applies the hook-supplied title to each panel's tab", () => {
    const opts = createBase();
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
    const opts = createBase();
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

  it("mounts the active panel's controls into the group actions slot and remounts on active-panel change", async () => {
    const opts = createBase();
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
    opts.blob = JSON.stringify(createTwoTabGroupLayout());
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
    // Since dockview 8 (with HTML5 drag-and-drop on, the default) a tab's
    // pointerdown DEFERS activation to the next animation frame, so a drag
    // that begins in the same gesture cannot double-act on the strip
    // (dockview/dockview#1631). The remount therefore lands one frame after
    // the pointerdown, exactly as it does for a user — assert after it.
    await nextAnimationFrame();
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
    const opts = createBase();
    const engine = createDockEngine(opts);
    expect(opts.container.querySelector(".rtc-dock-actions")).toBeNull();
    engine.dispose();
  });

  it("carries NO dockview theme gap — the 7px gutter is the leaf views' CSS inset", () => {
    const opts = createBase();
    const engine = createDockEngine(opts);
    // dockview flags a split view that carries a margin; the gap-0 model
    // must never produce one (the shave it triggers is what made every
    // model size fractional — see GROUP_GAP_PX). The inset itself is CSS
    // (dockview-hud.css), which jsdom does not lay out — the pixel witness
    // for the gutter is the visual tier.
    expect(GROUP_GAP_PX).toBe(7);
    expect(opts.container.querySelector(".dv-splitview-has-margin")).toBeNull();
    engine.dispose();
  });

  it("renders no tab close action (panel close/reopen is out of v1 scope)", () => {
    const opts = createBase();
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
    const opts = createBase();
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
    // extent (1200×800) applies. The seed's fractions divide CARD space
    // (what the user sees: 1200 minus one gap per child), and each view's
    // MODEL — the inline width dockview writes — is its card plus one gap,
    // so the split is 0.73 / 0.27 of 1186, plus 7 each: 873 and 327,
    // integers exactly (no shave, no flooring — the gap-0 model's point).
    // Also assert against the even-50/50 collapse this test regresses on.
    const cardSpace = 1200 - 2 * GROUP_GAP_PX;
    const main = Math.round(0.73 * cardSpace) + GROUP_GAP_PX;
    const side = cardSpace - Math.round(0.73 * cardSpace) + GROUP_GAP_PX;
    expect(viewWidths).toContain(main);
    expect(viewWidths).toContain(side);
    expect(viewWidths).not.toContain(600);

    engine.dispose();
  });

  it("coalesces two rapid layout mutations into a single onLayoutChange call", async () => {
    const calls: string[] = [];
    const opts = createBase();
    const engine = createDockEngine({
      ...opts,
      debounceMs: 30,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });
    // User-originated mutations, so dispose's final flush applies below.
    touchContainer(opts.container);

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

    engine.dispose(); // dispose's own final flush — a second, separate call
    expect(calls).toHaveLength(2);
  });
});

// A reload tears the page down without unmounting anything, so dispose's
// flush never runs — a change still inside the save debounce was simply lost
// (a float followed by a quick reload came back docked: 6a follow-up). The
// page's own `pagehide`, which a reload and a navigation both fire, lands
// the pending save first.
describe("pagehide flush", () => {
  it("lands a save still inside the debounce when the page is hidden", async () => {
    const calls: string[] = [];
    const engine = createDockEngine({
      ...createBase(),
      debounceMs: 60_000,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });

    engine.floatPanel("fx-analytics");
    // dockview's onDidLayoutChange is microtask-buffered.
    await Promise.resolve();

    expect(calls).toHaveLength(0);

    window.dispatchEvent(new Event("pagehide"));

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0] as string).floatingGroups).toHaveLength(1);
    engine.dispose();
  });

  it("writes nothing on pagehide when no save is pending", () => {
    const calls: string[] = [];
    const engine = createDockEngine({
      ...createBase(),
      debounceMs: 60_000,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });

    window.dispatchEvent(new Event("pagehide"));

    expect(calls).toHaveLength(0);
    engine.dispose();
  });
});

describe("dispose flush — arrangement origin", () => {
  it("does not persist a layout no pointer touched (seed path)", () => {
    const calls: string[] = [];
    const opts = createBase();
    const engine = createDockEngine({
      ...opts,
      // Long enough that no debounced save can land before dispose.
      debounceMs: 60_000,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });

    // A programmatic mutation — what a bridge's maximize/collapse REPLAY
    // does. It reconstructs layer-2 state and is replayed on the next mount,
    // so it is not arrangement and must not survive dispose.
    engine.maximizePanel("fx-rates");
    engine.dispose();

    expect(calls).toHaveLength(0);
  });

  it("does not persist a layout no pointer touched (blob path)", () => {
    const blob = userArrangedBlob(createBase());
    const calls: string[] = [];
    const engine = createDockEngine({
      ...createBase(),
      blob,
      debounceMs: 60_000,
      onLayoutChange: (next: string) => {
        calls.push(next);
      },
    });

    engine.maximizePanel("fx-rates");
    engine.dispose();

    expect(calls).toHaveLength(0);
  });

  it("persists through onLayoutChange once a pointer went down inside the container", () => {
    const calls: string[] = [];
    const opts = createBase();
    const engine = createDockEngine({
      ...opts,
      debounceMs: 60_000,
      onLayoutChange: (blob: string) => {
        calls.push(blob);
      },
    });

    opts.container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    engine.maximizePanel("fx-rates");
    engine.dispose();

    // Through the callback specifically: a bridge's reset path relies on a
    // suppression guard INSIDE onLayoutChange to stop this flush writing a
    // pre-reset layout over a store it has just cleared.
    expect(calls).toHaveLength(1);
  });

  it("a StrictMode double construction reseeds at the second engine's size instead of rescaling the first's", () => {
    // The visual host's failing shape, measured on app/fx-dockview: an eager
    // mount constructs engine #1 while the chrome above the container has
    // not settled (981px), StrictMode disposes it, and engine #2 constructs
    // at the settled 980px from whatever the store then holds.
    let stored: string | null = null;

    createDockEngine({
      ...createBase(),
      container: sizedContainer(1907, 981),
      debounceMs: 60_000,
      onLayoutChange: (blob: string) => {
        stored = blob;
      },
    }).dispose();

    const second = userFlushedSize(
      { ...createBase(), container: sizedContainer(1907, 980), blob: stored },
      "fx-blotter",
    );

    const fresh = userFlushedSize(
      { ...createBase(), container: sizedContainer(1907, 980) },
      "fx-blotter",
    );

    expect(second).toBe(fresh);
    // …and the reason: engine #1 persisted nothing, so #2 seeded exactly.
    expect(stored).toBeNull();
  });
});

describe("settle resize — a pristine grid tracks its source exactly", () => {
  beforeEach(() => {
    recordedObservers.splice(0);
  });

  it("lands a settle resize on exactly what a fresh engine at that size renders (seed path)", () => {
    const expected = freshSizesAt(1907, 980);

    const opts = fxAt(1907, 981);
    const engine = createDockEngine(opts);
    settleTo(opts.container, 1907, 980, true);

    expect(liveSizes()).toEqual(expected);
    engine.dispose();
  });

  it("lands exactly even when our observer runs before dockview lays out", () => {
    const expected = freshSizesAt(1907, 980);

    const opts = fxAt(1907, 981);
    const engine = createDockEngine(opts);
    settleTo(opts.container, 1907, 980, false);

    expect(liveSizes()).toEqual(expected);
    engine.dispose();
  });

  it("leaves a user-arranged grid to dockview's proportional resize", () => {
    // The lossy result, for comparison: dockview alone, nobody correcting.
    const lossyOpts = fxAt(1907, 981);
    const lossy = createDockEngine(lossyOpts);
    lastDockviewApi().layout(1907, 980);
    const proportional = liveSizes();
    lossy.dispose();

    const opts = fxAt(1907, 981);
    const engine = createDockEngine(opts);
    // Once a user has arranged the dock, its proportions are theirs: a resize
    // must rescale them, never snap back to the seed.
    touchContainer(opts.container);
    settleTo(opts.container, 1907, 980, true);

    expect(liveSizes()).toEqual(proportional);
    expect(proportional).not.toEqual(freshSizesAt(1907, 980));
    engine.dispose();
  });

  it("restores a blob saved at the settled size exactly after settling from a pre-settle container (blob path)", () => {
    const blob = userArrangedBlob(fxAt(1907, 980));

    const reference = createDockEngine({ ...fxAt(1907, 980), blob });
    const expected = liveSizes();
    reference.dispose();

    const opts = { ...fxAt(1907, 981), blob };
    const engine = createDockEngine(opts);
    settleTo(opts.container, 1907, 980, true);

    expect(liveSizes()).toEqual(expected);
    engine.dispose();
  });

  it("never snaps a restored user arrangement back to the seed on settle", () => {
    // A user dragged the tiles/blotter sash well away from the seed's ratio
    // and the layout was saved at the settled size…
    const savedOpts = fxAt(1907, 980);
    let blob = "";
    const saver = createDockEngine({
      ...savedOpts,
      onLayoutChange: (next: string) => {
        blob = next;
      },
    });
    touchContainer(savedOpts.container);
    lastDockviewApi().getPanel("fx-rates")?.group.api.setSize({ height: 500 });
    saver.dispose();
    const userRates = Number.parseInt(
      String(JSON.parse(blob).grid.root.data[0].data[0].size),
      10,
    );
    expect(userRates).toBeLessThan(600);

    // …then a reload restores it into a pre-settle container, still pristine
    // (nobody has touched THIS mount yet).
    const opts = { ...fxAt(1907, 981), blob };
    const engine = createDockEngine(opts);
    settleTo(opts.container, 1907, 980, true);

    expect(heightOf("fx-rates")).toBe(userRates);
    engine.dispose();
  });

  it("keeps a replayed strip at its bar through a settle", () => {
    const opts = fxAt(1907, 981);
    const engine = createDockEngine(opts);
    // A bridge's collapse REPLAY: programmatic, so the grid is still pristine.
    engine.collapsePanel("fx-blotter");
    // group.api heights are MODEL sizes (card + gap), so the bar is read live
    // rather than compared to the 32px STRIP card constant.
    const barBefore = heightOf("fx-blotter");
    settleTo(opts.container, 1907, 980, true);

    const bar = heightOf("fx-blotter");
    const rates = heightOf("fx-rates");
    engine.dispose();

    expect(bar).toBe(barBefore);
    // …and its sibling took the rest of the column rather than a seed size
    // that would leave a gap (or overlap) against the clamped bar.
    const fresh = freshSizesAt(1907, 980);
    expect(rates + bar).toBe(
      modelHeight(fresh["fx-rates"]) + modelHeight(fresh["fx-blotter"]),
    );
  });

  function heightOf(panelId: string): number {
    return lastDockviewApi().getPanel(panelId)?.group.api.height ?? Number.NaN;
  }

  function modelHeight(size: string | undefined): number {
    return Number.parseInt((size ?? "").split("x")[0] ?? "", 10);
  }

  // The real FX tab's ratios (client-core defaultLayoutPort's FX_ROOT). Made-up
  // fractions do NOT reproduce the bug: 0.75/0.25 + 0.65/0.35 rescaled
  // 981→980 losslessly (measured), so a fixture that "looks equivalent" would
  // let a broken fix pass.
  const FX_REAL = {
    kind: "split",
    dir: "row",
    sizes: [0.73, 0.27],
    initialPx: [undefined, 360],
    children: [
      {
        kind: "split",
        dir: "column",
        sizes: [0.66, 0.34],
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

  const FX_IDS = ["fx-rates", "fx-blotter", "fx-analytics", "fx-positions"];

  function fxAt(width: number, height: number): DockEngineOptions {
    return {
      ...createBase(),
      container: sizedContainer(width, height),
      seed: FX_REAL,
      debounceMs: 60_000,
    };
  }

  /** The container settles to width×height. With `dockviewFirst`, dockview's
   * own shell observer has already laid the grid out proportionally — what a
   * browser does, and the lossy step — before ours runs; without it, ours runs
   * first. RO callback order across observers isn't something to rely on. */
  function settleTo(
    container: HTMLElement,
    width: number,
    height: number,
    dockviewFirst: boolean,
  ): void {
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      get: () => {
        return width;
      },
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      get: () => {
        return height;
      },
    });

    if (dockviewFirst) {
      lastDockviewApi().layout(width, height);
    }

    for (const observer of [...recordedObservers]) {
      if (observer.targets.includes(container)) {
        const entry = {
          target: container,
          contentRect: { width, height },
        } as unknown as ResizeObserverEntry;
        observer.callback([entry], observer as unknown as ResizeObserver);
      }
    }
  }

  /** Every FX group's live height×width, as dockview holds it right now. */
  function liveSizes(): Record<string, string> {
    const api = lastDockviewApi();

    return Object.fromEntries(
      FX_IDS.map((id) => {
        const group = api.getPanel(id)?.group;

        return [id, `${group?.api.height}x${group?.api.width}`];
      }),
    );
  }

  function freshSizesAt(width: number, height: number): Record<string, string> {
    const engine = createDockEngine(fxAt(width, height));
    const sizes = liveSizes();
    engine.dispose();

    return sizes;
  }
});

describe("collapse / expand", () => {
  it("strips a collapsed panel's group to the 32px bar", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });

    engine.collapsePanel("fx-analytics");

    // 0.25 of the 1200px fallback width before, the strip after.
    await waitForSize(seen, "fx-analytics", STRIP);
    expect(seen.sizeOf("fx-analytics")).toBe(STRIP);
    engine.dispose();
  });

  it("restores the exact pre-collapse size on expand", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const before = baselineSize(createBase(), "fx-analytics");

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
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const before = baselineSize(createBase(), "fx-analytics");

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
      ...createBase(),
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
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const before = baselineSize(createBase(), "fx-blotter");

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    engine.expandPanel("fx-blotter");

    await waitForSize(seen, "fx-blotter", before);
    expect(seen.sizeOf("fx-blotter")).toBe(before);
    engine.dispose();
  });

  it("reports the vertical orientation for a side-by-side sibling through onStripsChange — once, not again on a repeat call or an unknown id", () => {
    const strips = recordStrips();
    const engine = createDockEngine({ ...createBase(), ...strips.options });

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
    const engine = createDockEngine({ ...createBase(), ...seen.options });

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
    const engine = createDockEngine(createBase());

    expect(() => {
      engine.collapsePanel("nope");
      engine.expandPanel("nope");
    }).not.toThrow();
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("marks a stripped group as no-drop-target and lifts it on expand", async () => {
    // A bar has no visible header and hides its content — a drop into it
    // would swallow the dropped panel (audit S1). dockview toggles the
    // dv-locked-groupview class for locked === "no-drop-target", which is
    // the observable jsdom gets.
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    const before = baselineSize(createBase(), "fx-blotter");

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview"),
    ).toHaveLength(1);

    engine.expandPanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", before);
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview"),
    ).toHaveLength(0);
    engine.dispose();
  });

  it("voids a pre-strip world when a drop changes the split's membership", async () => {
    // The world snapshot taken at fx-blotter's collapse knows only
    // {rates, blotter}. Dropping analytics INTO the column extends the
    // split in place (element reused — measured 2026-09-11), so an
    // Element-keyed world survives and the expand's put-back re-asserts
    // rates to its PRE-DROP size, yanking space from the newcomer. A world
    // whose membership drifted describes a defunct arrangement: it must be
    // voided, never re-asserted — rates keeps its post-drop allocation.
    const seen = trackLayout();
    const blotterBefore = baselineSize(createBase(), "fx-blotter");
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const dock = lastDockviewApi();

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);

    const analytics = dock.getPanel("fx-analytics");
    const rates = dock.getPanel("fx-rates");

    if (analytics === undefined || rates === undefined) {
      throw new Error("fixture panels missing");
    }

    analytics.api.moveTo({ group: rates.group, position: "bottom" });
    const ratesAfterDrop = rates.group.api.height;

    // restore() sets blotter's own model exactly; the delta lands on the
    // OTHER members, which is precisely what this test watches.
    engine.expandPanel("fx-blotter");
    await waitForSizeWithin(seen, "fx-blotter", blotterBefore, 2);

    expect(
      Math.abs(rates.group.api.height - ratesAfterDrop),
    ).toBeLessThanOrEqual(25);
    engine.dispose();
  });

  it("locks every maximize-forced strip and unlocks them all on exit", async () => {
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    const before = baselineSize(createBase(), "fx-blotter");

    engine.maximizePanel("fx-rates");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview").length,
    ).toBeGreaterThanOrEqual(2);

    engine.exitMaximize();
    await waitForSize(seen, "fx-blotter", before);
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview"),
    ).toHaveLength(0);
    engine.dispose();
  });
});

const STRIP_HEIGHT = 32;

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
      ...createBase(),
      ...seen.options,
      ...strips.options,
    });
    const columnBefore = baselineBranchSize(createBase(), "fx-rates");
    const ratesBefore = baselineSize(createBase(), "fx-rates");
    const blotterBefore = baselineSize(createBase(), "fx-blotter");

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
    // beside a full-height one: the 800px fallback halved in model terms
    // (400 each), read back as cards (− one gap): 393.
    expect(seen.sizeOf("fx-rates")).toEqual(within(393, 1));
    expect(seen.sizeOf("fx-blotter")).toEqual(within(393, 1));

    engine.expandPanel("fx-blotter");
    expect(strips.last).toEqual({ "fx-rates": "horizontal" });
    // The column gets its width back and the survivor its 32px bar; the
    // expanded panel fills the rest of the column (800 minus both cards'
    // gaps minus the bar), as in-house — its own pre-collapse height only
    // means something once its sibling is back too.
    await waitForBranchSize(seen, "fx-rates", columnBefore);
    await waitForSize(seen, "fx-rates", STRIP_HEIGHT);
    await waitForSize(
      seen,
      "fx-blotter",
      800 - 2 * GROUP_GAP_PX - STRIP_HEIGHT,
    );

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
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const ratesBefore = baselineSize(createBase(), "fx-rates");
    const blotterBefore = baselineSize(createBase(), "fx-blotter");

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
    const opts = { ...createBase(), seed: stack };
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    const before = baselines({ ...createBase(), seed: stack }, [
      "st-top",
      "st-mid",
      "st-low",
    ]);

    // Under the gap-0 model even a 3-child branch's sizes are exact
    // integers (the gap-7 era's 7 × 2⁄3 share made them repeating
    // decimals), so the bars read at exactly the strip size.
    engine.collapsePanel("st-top");
    await waitForSize(seen, "st-top", STRIP_HEIGHT);
    engine.collapsePanel("st-mid");
    await waitForSize(seen, "st-mid", STRIP_HEIGHT);
    engine.collapsePanel("st-low");
    await waitForBranchSize(seen, "st-top", STRIP);

    engine.expandPanel("st-top");
    await waitForSize(seen, "st-mid", STRIP_HEIGHT);
    engine.expandPanel("st-mid");
    engine.expandPanel("st-low");

    for (const panelId of ["st-top", "st-mid", "st-low"]) {
      await waitForSizeWithin(seen, panelId, before.get(panelId) ?? 0, 2);
    }

    engine.dispose();
  });

  it("reads every strip against the row when the whole dock is stripped", () => {
    const strips = recordStrips();
    const engine = createDockEngine({ ...createBase(), ...strips.options });

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

  it("restores a flipped rail across an adjacent drop's restructure", async () => {
    // Characterisation, not a bug witness: measured in jsdom (2026-09-11),
    // dockview rebuilds only the splits along a move's own source and
    // destination path — an adjacent drop leaves a flipped split's element
    // intact (5→4 splits, identity preserved). This pins that a drop in
    // the MAIN column never costs the flipped rail its remembered width,
    // whatever the flip ledger is keyed by.
    const seen = trackLayout();
    // Baseline twin FIRST: it creates and disposes its own engine, and the
    // api capture always points at the most recent createDockview.
    const railBefore = baselineBranchSize(createRailBase(), "fx-analytics");
    const engine = createDockEngine({ ...createRailBase(), ...seen.options });
    const dock = lastDockviewApi();

    engine.collapsePanel("fx-analytics");
    engine.collapsePanel("fx-positions");
    await waitForBranchSize(seen, "fx-analytics", STRIP);

    const blotter = dock.getPanel("fx-blotter");
    const rates = dock.getPanel("fx-rates");

    if (blotter === undefined || rates === undefined) {
      throw new Error("fixture panels missing");
    }

    blotter.api.moveTo({ group: rates.group, position: "left" });

    engine.expandPanel("fx-positions");
    await waitForBranchSize(seen, "fx-analytics", railBefore);
    engine.dispose();
  });
});

describe("maximize (the in-house boundary policy)", () => {
  it("root scope: strips every other panel, the rail flipping vertical, and restores each exactly", async () => {
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...createRailBase(),
      ...seen.options,
      ...strips.options,
    });

    const before = baselines(createRailBase(), [
      "fx-rates",
      "fx-blotter",
      "fx-analytics",
      "fx-positions",
    ]);
    const railBefore = baselineBranchSize(createRailBase(), "fx-analytics");

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
      ...createRailBase(),
      ...seen.options,
      ...strips.options,
    });
    const before = baselines(createRailBase(), ["fx-rates", "fx-blotter"]);
    const positionsBefore = baselineSize(createRailBase(), "fx-positions");
    const railBefore = baselineBranchSize(createRailBase(), "fx-analytics");

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
      ...createBase(),
      ...strips.options,
      panels: { ...createBase().panels, maximizeScope: railScope },
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
      ...createRailBase(),
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
    const engine = createDockEngine({ ...createRailBase(), ...strips.options });

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
      ...createRailBase(),
      ...seen.options,
      ...strips.options,
    });

    const before = baselines(createRailBase(), [
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
    const opts = { ...createRailBase(), ...strips.options };
    const engine = createDockEngine(opts);

    engine.maximizePanel("nope");
    expect(strips.calls).toBe(0);
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);

    engine.maximizePanel("fx-rates");
    engine.maximizePanel("fx-rates");
    expect(strips.calls).toBe(1);
    engine.dispose();
  });

  // In-house, maximize strips every leaf under the maximize BOUNDARY except
  // the maximized panel — the whole dock, or a "nearest-column" panel's own
  // column. Dockview's native maximize hides siblings and has no scope, so
  // the engine emulates the policy over its strip machinery instead; these
  // pin that the result IS the in-house one: same strips, same orientations,
  // the maximized panel filling what they free, and an exact restore.
  const FILL = 800 - 2 * GROUP_GAP_PX - STRIP_HEIGHT;
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
    const opts = createBase();
    const engine = createDockEngine(opts);

    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    engine.dispose();
  });

  it("wraps every intent and clears itself once the transition has run", () => {
    vi.useFakeTimers();
    const opts = createBase();
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
    const opts = createBase();
    const engine = createDockEngine(opts);

    engine.exitMaximize();
    expect(opts.container.hasAttribute(DOCK_GLIDE_ATTRIBUTE)).toBe(false);
    engine.dispose();
  });

  it("restarts the clock on a second intent mid-glide instead of cutting the first short", () => {
    vi.useFakeTimers();
    const opts = createBase();
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
    const opts = createBase();
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
  it("opens the rail at its design width and persists the pin in the blob", () => {
    const seen = trackLayout();
    persistArranged({ ...createRailPinnedBase(), ...seen.options });

    expect(seen.branchSizeOf("fx-analytics")).toBe(360);
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("pins a lone panel child too, not just a rail split", () => {
    const seen = trackLayout();
    persistArranged({
      ...createBase(),
      ...seen.options,
      seed: { ...FX_LIKE, initialPx: [undefined, 360] },
    });

    expect(seen.sizeOf("fx-analytics")).toBe(360);
    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics"], px: 360, axis: "width" },
    ]);
  });

  it("restores the design width after the whole rail strips and expands", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({
      ...createRailPinnedBase(),
      ...seen.options,
    });

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
    const engine = createDockEngine({
      ...createRailPinnedBase(),
      ...seen.options,
    });

    const analyticsBefore = baselineSize(
      createRailPinnedBase(),
      "fx-analytics",
    );

    const positionsBefore = baselineSize(
      createRailPinnedBase(),
      "fx-positions",
    );

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
    const opts = createRailPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    dragSash(opts.container, ".dv-horizontal");
    engine.dispose();
    expect(seen.pins()).toEqual([]);
  });

  it("keeps the pin on a grab that never moves", () => {
    const opts = createRailPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    grabSash(opts.container, ".dv-horizontal");
    window.dispatchEvent(new Event("pointerup"));
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("leaves the rail pin alone when the drag is in a nested split", () => {
    const opts = createRailPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    dragSash(opts.container, ".dv-vertical");
    engine.dispose();
    expect(seen.pins()).toEqual([RAIL_PIN]);
  });

  it("re-applies a still-pinned blob's pin on the next load", () => {
    const opts = createRailPinnedBase();
    const seen = trackLayout();
    persistArranged({ ...opts, ...seen.options });

    const reloaded = trackLayout();
    persistArranged({
      ...createRailPinnedBase(),
      ...reloaded.options,
      blob: seen.blob(),
    });

    expect(reloaded.pins()).toEqual([RAIL_PIN]);
    expect(reloaded.branchSizeOf("fx-analytics")).toBe(360);
  });

  it("keeps a released pin released across reloads", () => {
    const opts = createRailPinnedBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    dragSash(opts.container, ".dv-horizontal");
    engine.dispose();

    const reloaded = trackLayout();
    persistArranged({
      ...createRailPinnedBase(),
      ...reloaded.options,
      blob: seen.blob(),
    });

    expect(reloaded.pins()).toEqual([]);
  });

  it("treats a legacy blob without the sidecar as unpinned", () => {
    const seen = trackLayout();
    persistArranged({ ...createRailPinnedBase(), ...seen.options });
    const legacy: Record<string, unknown> = JSON.parse(seen.blob());
    delete legacy.rtcDesignPins;

    const reloaded = trackLayout();
    persistArranged({
      ...createRailPinnedBase(),
      ...reloaded.options,
      blob: JSON.stringify(legacy),
    });

    expect(reloaded.pins()).toEqual([]);
  });

  it("drops a pin whose panels no longer fill their groups exactly", () => {
    // A blob whose analytics tab was drag-docked beside rates: the pin's
    // clamp would hold the rates group too, so it must dissolve instead.
    const seen = trackLayout();
    persistArranged({
      ...createBase(),
      ...seen.options,
      blob: JSON.stringify({
        ...(createTwoTabGroupLayout() as Record<string, unknown>),
        rtcDesignPins: [{ panelIds: ["fx-analytics"], px: 360, axis: "width" }],
      }),
    });

    expect(seen.pins()).toEqual([]);
  });

  it("dissolves a pin and releases its clamps when a member is dragged to its own rail", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({
      ...createRailPinnedBase(),
      ...seen.options,
    });
    const dock = lastDockviewApi();
    const analytics = dock.getPanel("fx-analytics");
    const rates = dock.getPanel("fx-rates");

    if (analytics === undefined || rates === undefined) {
      throw new Error("fixture panels missing");
    }

    // The drop operation IS moveTo (audit-verified): eject analytics out of
    // the pinned rail to the far side of the rates group. Both fragments
    // then hold ONLY pinned panels, so the exact-fill check alone passes
    // vacuously — the structural rail invariant is what must dissolve the
    // pin, and its clamps must release NOW, not at the next save.
    analytics.api.moveTo({ group: rates.group, position: "left" });
    await waitForPins(seen, 0);

    const positions = dock.getPanel("fx-positions");

    if (positions === undefined) {
      throw new Error("fx-positions missing");
    }

    expect(positions.group.minimumWidth).not.toBe(positions.group.maximumWidth);
    expect(analytics.group.minimumWidth).not.toBe(analytics.group.maximumWidth);
    engine.dispose();
  });

  function createRailPinnedBase(): DockEngineOptions {
    return {
      ...createRailBase(),
      seed: { ...RAIL_LIKE, initialPx: [undefined, 360] },
    };
  }

  const RAIL_PIN = {
    panelIds: ["fx-analytics", "fx-positions"],
    px: 360,
    axis: "width",
  };
});

describe("maximize over a design pin (R15a — the maximized panel fills)", () => {
  it("lifts a maximized dynamic panel's pin clamp so it fills, and exit restores the exact clamp", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    expect(widthClampOf("panel-dyn-1")).toEqual(PINNED);

    engine.maximizePanel("panel-dyn-1");
    expect(widthClampOf("panel-dyn-1")).not.toEqual(PINNED);
    await vi.waitFor(() => {
      expect(seen.sizeOf("panel-dyn-1")).toBeGreaterThan(360 * 2);
    });
    // The record outlives the suspension: a save taken now still pins.
    expect(seen.pins()).toEqual([
      { panelIds: ["panel-dyn-1"], px: 360, axis: "width" },
    ]);

    engine.exitMaximize();
    expect(widthClampOf("panel-dyn-1")).toEqual(PINNED);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.dispose();
  });

  it("re-clamps the first panel's pin when the maximize switches to another panel", () => {
    // fx-analytics is nearest-column scoped here: the switch's boundary is
    // the rail column, so the dynamic panel is NOT re-stripped — its clamp
    // is readable right after the switch.
    const engine = createDockEngine(createRailBase());
    engine.addDynamicPanel(DYN);

    engine.maximizePanel("panel-dyn-1");
    expect(widthClampOf("panel-dyn-1")).not.toEqual(PINNED);

    engine.maximizePanel("fx-analytics");
    expect(widthClampOf("panel-dyn-1")).toEqual(PINNED);
    engine.dispose();
  });

  it("suspends a seeded rail pin across all its members for a root-scope maximize", async () => {
    const seen = trackLayout();
    const opts: DockEngineOptions = {
      ...createRailBase(),
      seed: { ...RAIL_LIKE, initialPx: [undefined, 360] },
      panels: { ...createRailBase().panels, maximizeScope: rootScope },
    };
    const engine = createDockEngine({ ...opts, ...seen.options });
    expect(widthClampOf("fx-analytics")).toEqual(PINNED);

    engine.maximizePanel("fx-analytics");
    // The maximized group AND its stripped rail sibling: the rail column's
    // width is the meet of both, so lifting one alone would still hold it.
    expect(widthClampOf("fx-analytics")).not.toEqual(PINNED);
    expect(widthClampOf("fx-positions")).not.toEqual(PINNED);
    await vi.waitFor(() => {
      expect(seen.branchSizeOf("fx-analytics")).toBeGreaterThan(360 * 2);
    });

    engine.exitMaximize();
    expect(widthClampOf("fx-analytics")).toEqual(PINNED);
    expect(widthClampOf("fx-positions")).toEqual(PINNED);
    await waitForBranchSize(seen, "fx-analytics", 360);
    engine.dispose();
    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
    ]);
  });

  it("keeps a rail pin whose split lies outside a nearest-column maximize's boundary", () => {
    // The rail's width pin is declared by the ROOT row; a nearest-column
    // maximize claims only its column's height, so the width stays held.
    const engine = createDockEngine({
      ...createRailBase(),
      seed: { ...RAIL_LIKE, initialPx: [undefined, 360] },
    });

    engine.maximizePanel("fx-analytics");
    expect(widthClampOf("fx-analytics")).toEqual(PINNED);
    engine.dispose();
  });

  it("removing a pinned owner of the maximize leaves no suspended state behind", async () => {
    // Baseline FIRST: its throwaway twin replaces lastDockviewApi().
    const rates = baselineSize(createBase(), "fx-rates");
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    engine.addDynamicPanel(DYN);
    engine.addDynamicPanel(DYN_2);

    engine.maximizePanel("panel-dyn-1");
    engine.removeDynamicPanel("panel-dyn-1");

    // The survivor comes back from its strip at its own pin, unlocked.
    expect(widthClampOf("panel-dyn-2")).toEqual(PINNED);
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview"),
    ).toHaveLength(0);
    await waitForSizeWithin(seen, "fx-rates", rates, 8);

    // A later maximize of the survivor suspends and restores only ITS pin.
    engine.maximizePanel("panel-dyn-2");
    expect(widthClampOf("panel-dyn-2")).not.toEqual(PINNED);
    engine.exitMaximize();
    expect(widthClampOf("panel-dyn-2")).toEqual(PINNED);
    await waitForPins(seen, 1);
    expect(seen.pins()).toEqual([
      { panelIds: ["panel-dyn-2"], px: 360, axis: "width" },
    ]);
    engine.dispose();
  });

  it("a sash drag mid-maximize releases the pin for good — exit does not re-clamp it", () => {
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    engine.addDynamicPanel(DYN);

    engine.maximizePanel("panel-dyn-1");
    dragSash(opts.container, ".dv-horizontal");
    engine.exitMaximize();

    expect(widthClampOf("panel-dyn-1")).not.toEqual(PINNED);
    engine.dispose();
    expect(seen.pins()).toEqual([]);
  });

  it("a blob saved mid-maximize carries the pin; the reload clamps it and a replayed maximize suspends it again", () => {
    const firstOpts = createBase();
    const seen = trackLayout();
    const first = createDockEngine({
      ...firstOpts,
      ...seen.options,
      dynamicPanels: [DYN],
    });
    first.maximizePanel("panel-dyn-1");
    touchContainer(firstOpts.container);
    first.dispose();
    expect(seen.pins()).toEqual([
      { panelIds: ["panel-dyn-1"], px: 360, axis: "width" },
    ]);

    const second = createDockEngine({
      ...createBase(),
      ...trackLayout().options,
      blob: seen.blob(),
      dynamicPanels: [DYN],
    });
    expect(widthClampOf("panel-dyn-1")).toEqual(PINNED);
    second.maximizePanel("panel-dyn-1"); // the bridge's replay
    expect(widthClampOf("panel-dyn-1")).not.toEqual(PINNED);
    second.exitMaximize();
    expect(widthClampOf("panel-dyn-1")).toEqual(PINNED);
    second.dispose();
  });

  function rootScope(): DockMaximizeScope {
    return "root";
  }

  // A pin is min=max on its axis, and a maximize only STRIPS the others: a
  // pinned maximized group would hold its design width beside a dock of bars
  // (measured live: [32,32,32,32,360,32,32]). In-house fills the dock, so the
  // maximize suspends the pin's clamp — the RECORD stays (a save mid-maximize
  // still carries it) — and every exit path re-clamps it.
  const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;

  const DYN_2 = { id: "panel-dyn-2", initialPx: 360 } as const;

  const PINNED = [360 + GROUP_GAP_PX, 360 + GROUP_GAP_PX];
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
    const first = createDockEngine({ ...createBase(), ...seen.options });
    const before = baselineSize(createBase(), "fx-analytics");

    first.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
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
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    const before = baselineSize(createBase(), "fx-analytics");

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    engine.dispose();

    // The sidecar persists MODEL sizes (the engine's working units in the
    // gap-0 model); the visible card it restores is one gap less.
    const sidecar = JSON.parse(seen.blob()).rtcStripGeometry;
    expect(sidecar.records["fx-analytics"].size).toEqual(
      within(before + GROUP_GAP_PX, 1),
    );
  });

  it("serialises a stripped layout without any locked mark in the blob", async () => {
    // Lock state is DERIVED (a group is locked iff it is a strip right now);
    // dockview's toJSON would persist it, and a persisted lock could
    // re-impose itself on a layout whose collapse state changed while this
    // engine was not looking. The save scrubs it; the reload's collapse
    // replay re-derives it.
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });

    engine.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    engine.dispose();

    expect(seen.blob()).not.toContain('"locked"');
  });

  it("restores a fully-stripped column across a reload — its width and both heights", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...createBase(), ...seen.options });
    const columnBefore = baselineBranchSize(createBase(), "fx-rates");
    const ratesBefore = baselineSize(createBase(), "fx-rates");
    const blotterBefore = baselineSize(createBase(), "fx-blotter");

    first.collapsePanel("fx-rates");
    first.collapsePanel("fx-blotter");
    await waitForBranchSize(seen, "fx-rates", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
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
    const first = createDockEngine({ ...createBase(), ...seen.options });
    const ratesBefore = baselineSize(createBase(), "fx-rates");
    const blotterBefore = baselineSize(createBase(), "fx-blotter");

    first.collapsePanel("fx-rates");
    first.collapsePanel("fx-blotter");
    await waitForBranchSize(seen, "fx-rates", STRIP);
    first.dispose();

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
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
    const first = createDockEngine({ ...createBase(), ...seen.options });
    first.collapsePanel("fx-analytics");
    await waitForSize(seen, "fx-analytics", STRIP);
    first.dispose();
    const legacy: Record<string, unknown> = JSON.parse(seen.blob());
    delete legacy.rtcStripGeometry;

    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
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
    persistArranged({ ...createBase(), ...seen.options });
    const tampered: Record<string, unknown> = JSON.parse(seen.blob());
    tampered.rtcStripGeometry = {
      records: { "fx-analytics": { size: "wide" } },
      flips: "nope",
    };

    const reloaded = trackLayout();
    const engine = createDockEngine({
      ...createBase(),
      ...reloaded.options,
      blob: JSON.stringify(tampered),
    });
    engine.collapsePanel("fx-analytics");
    await waitForSize(reloaded, "fx-analytics", STRIP);
    engine.dispose();
  });

  it("keeps a strip-free blob free of the sidecar and stable across a reload", () => {
    const seen = trackLayout();
    persistArranged({ ...createBase(), ...seen.options });
    expect(JSON.parse(seen.blob()).rtcStripGeometry).toBeUndefined();

    const reloaded = trackLayout();
    persistArranged({
      ...createBase(),
      ...reloaded.options,
      blob: seen.blob(),
    });
    expect(reloaded.blob()).toBe(seen.blob());
  });
});

describe("the gap-0 blob model (rtcBlobVersion 2)", () => {
  it("stamps every save with the current blob version", () => {
    const seen = trackLayout();
    persistArranged({ ...createBase(), ...seen.options });

    expect(JSON.parse(seen.blob()).rtcBlobVersion).toBe(2);
  });

  it("persists only integer model sizes through a full intent cycle", async () => {
    // The refactor's core invariant: with no theme gap there is no
    // per-sibling share, so nothing ever introduces a fraction — the
    // half-pixel card edges (and the client-asymmetric glyph phase they
    // caused) are structurally gone, not tolerated.
    const seen = trackLayout();
    const engine = createDockEngine({ ...createRailBase(), ...seen.options });

    engine.collapsePanel("fx-blotter");
    await waitForSize(seen, "fx-blotter", STRIP_HEIGHT);
    engine.maximizePanel("fx-rates");
    engine.exitMaximize();
    engine.expandPanel("fx-blotter");
    engine.dispose();

    // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
    function sizesUnder(node: any): number[] {
      if (node.type !== "branch") {
        return [];
      }

      // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
      return (node.data as any[]).flatMap((child) => {
        return [child.size, ...sizesUnder(child)];
      });
    }

    const sizes = sizesUnder(JSON.parse(seen.blob()).grid.root);
    expect(sizes.length).toBeGreaterThan(0);

    for (const size of sizes) {
      expect(Number.isInteger(size)).toBe(true);
    }
  });

  it("migrates a legacy gap-7 blob's grid and re-clamps its pin at the design width", () => {
    // A gap-7-era save: every branch child at card + gap × (n − 1) / n
    // (all branches here have 2 children → +3.5), grid dims from the old
    // 10px-padded container — 7px smaller than today's per axis, so the
    // migrated sums land exactly on the jsdom fallback extent (1200×800).
    const legacy = {
      grid: {
        root: {
          type: "branch",
          data: [
            {
              type: "branch",
              size: 829.5,
              data: [
                legacyLeaf("fx-rates", 522.5),
                legacyLeaf("fx-blotter", 270.5),
              ],
            },
            legacyLeaf("fx-analytics", 363.5),
          ],
        },
        width: 1193,
        height: 793,
        orientation: "HORIZONTAL",
      },
      panels: {
        "fx-rates": legacyPanel("fx-rates"),
        "fx-blotter": legacyPanel("fx-blotter"),
        "fx-analytics": legacyPanel("fx-analytics"),
      },
      rtcDesignPins: [{ panelIds: ["fx-analytics"], px: 360, axis: "width" }],
    };

    const seen = trackLayout();
    persistArranged({
      ...createBase(),
      ...seen.options,
      blob: JSON.stringify(legacy),
    });

    // The pin's PUBLIC card px survives migration untouched and the clamp
    // adds the gap — the rail reads its design width exactly, and the
    // re-saved blob is stamped current.
    expect(seen.sizeOf("fx-analytics")).toBe(360);
    expect(seen.pins()).toEqual(legacy.rtcDesignPins);
    expect(JSON.parse(seen.blob()).rtcBlobVersion).toBe(2);
  });

  it("migrates a legacy strip sidecar's card sizes so expand restores the card", async () => {
    // The legacy grid holds fx-analytics AT its bar (old bar model:
    // 32 + 3.5), and the sidecar remembers the pre-collapse size in the old
    // rendered/card units (300). Migration lifts it to model units (+gap);
    // the replayed collapse consumes it and expand must land the CARD.
    const legacy = {
      grid: {
        root: {
          type: "branch",
          data: [
            {
              type: "branch",
              size: 1157.5,
              data: [
                legacyLeaf("fx-rates", 522.5),
                legacyLeaf("fx-blotter", 270.5),
              ],
            },
            legacyLeaf("fx-analytics", 35.5),
          ],
        },
        width: 1193,
        height: 793,
        orientation: "HORIZONTAL",
      },
      panels: {
        "fx-rates": legacyPanel("fx-rates"),
        "fx-blotter": legacyPanel("fx-blotter"),
        "fx-analytics": legacyPanel("fx-analytics"),
      },
      rtcStripGeometry: {
        records: { "fx-analytics": { size: 300 } },
        flips: [],
      },
    };

    const reloaded = trackLayout();
    const engine = createDockEngine({
      ...createBase(),
      ...reloaded.options,
      blob: JSON.stringify(legacy),
    });
    engine.collapsePanel("fx-analytics");
    await waitForSize(reloaded, "fx-analytics", STRIP);

    engine.expandPanel("fx-analytics");
    await waitForSizeWithin(reloaded, "fx-analytics", 300, 1);
    engine.dispose();
  });

  function legacyLeaf(id: string, size: number): Record<string, unknown> {
    return {
      type: "leaf",
      size,
      data: { id: `g-${id}`, views: [id], activeView: id },
    };
  }

  function legacyPanel(id: string): Record<string, string> {
    return { id, contentComponent: "rtc-panel", title: id };
  }
});

describe("dynamic panels (Jarvis docking — GenUI × Dockview)", () => {
  it("adds a dynamic panel as a new right-edge group at its initialPx card width", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const api = lastDockviewApi();
    expect(api.getPanel("panel-dyn-1")).toBeDefined();
    // its own group — not stacked into an existing one
    expect(api.getPanel("panel-dyn-1")?.group.panels).toHaveLength(1);
    engine.dispose();
  });

  it("is idempotent — adding an existing id changes nothing", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const before = lastDockviewApi().groups.length;
    engine.addDynamicPanel(DYN);
    expect(lastDockviewApi().groups.length).toBe(before);
    expect(seen.pins()).toHaveLength(1); // no duplicate pin either
    engine.dispose();
  });

  it("persists the dynamic panel's pin and releases it on a sash drag", async () => {
    // A synthetic drag (no real geometry change) never fires dockview's own
    // onDidLayoutChange, so — like the sibling design-pin release tests —
    // the release is asserted from the blob dispose() flushes unconditionally,
    // not via waitForPins.
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForPins(seen, 1);
    expect(seen.pins()).toEqual([
      { panelIds: ["panel-dyn-1"], px: 360, axis: "width" },
    ]);

    dragSash(opts.container, ".dv-horizontal");
    engine.dispose();
    expect(seen.pins()).toEqual([]);
  });

  it("removes a dynamic panel and its group", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const before = engine.groupCount();
    engine.removeDynamicPanel("panel-dyn-1");
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    expect(engine.groupCount()).toBe(before - 1);
    engine.removeDynamicPanel("panel-dyn-1"); // unknown id: no-op, no throw
    engine.dispose();
  });

  it("does not persist the design pin after the panel is removed", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForPins(seen, 1);
    engine.removeDynamicPanel("panel-dyn-1");
    await vi.waitFor(() => {
      expect(seen.pins()).toEqual([]);
    });
    engine.dispose();
  });

  it("purges the strip ledger on removal — no phantom rtcStripGeometry", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...createBase(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.collapsePanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", STRIP);
    engine.removeDynamicPanel("panel-dyn-1");
    await vi.waitFor(() => {
      const blob = JSON.parse(seen.blob());
      expect(JSON.stringify(blob.rtcStripGeometry ?? {})).not.toContain(
        "panel-dyn-1",
      );
    });
    engine.dispose();
  });

  it("a dynamic panel joins the stripDir walk — collapsing it as the column's last panel flips the column", async () => {
    // Docked as a lone panel at the right edge, so collapsing it must read
    // against the ROW (vertical strip), exactly as a static lone column does
    // (the "fully-stripped column" suite above).
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...createBase(),
      ...seen.options,
      ...strips.options,
    });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.collapsePanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", STRIP);
    expect(strips.last["panel-dyn-1"]).toBe("vertical");
    engine.expandPanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", 360); // pin-remembered width restored
    engine.dispose();
  });

  it("removing a maximize-forced strip's owner restores the survivors", async () => {
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const rates = baselineSize(createBase(), "fx-rates");
    engine.maximizePanel("panel-dyn-1"); // strips every static panel
    engine.removeDynamicPanel("panel-dyn-1");
    await waitForSizeWithin(seen, "fx-rates", rates, 8); // statics restored
    // fx-analytics sits directly under the ROOT split as its own leaf (no
    // intermediate branch to measure via branchSizeOf — findBranchSize's own
    // doc comment: "Null for a leaf sitting directly under the root"). It
    // restores via a DIFFERENT path than fx-rates: fx-rates comes back
    // through settleStripFreeWorlds' per-member world reassert (the nested
    // column split's membership is untouched by removing panel-dyn-1), while
    // fx-analytics is a DIRECT member of panel-dyn-1's own split — that
    // split's membership DOES change when panel-dyn-1 leaves, so its world
    // is voided (the deliberate audit-S3 rule) and it is NOT put back to its
    // exact pre-maximize width; it only needs to come back UNSTRIPPED, with
    // dockview's own redistribution (now the sole survivor of that split)
    // deciding its size — exactly what deleteDynamicPanel's own comment says.
    await vi.waitFor(() => {
      const width = seen.sizeOf("fx-analytics");
      expect(width).not.toBeNull();
      expect(width as number).toBeGreaterThan(STRIP);
    });
    expect(
      opts.container.querySelectorAll(".dv-locked-groupview"),
    ).toHaveLength(0);
    engine.dispose();
  });

  it("opens an `unpinned` dynamic panel at its initialPx without a design pin, beside a pinned one", async () => {
    // R15b: chart instances share space — same right-edge group at the same
    // opening width, but no min=max clamp and nothing in rtcDesignPins. The
    // flag-less panel beside it is pinned exactly as before.
    const opts = createBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });
    engine.addDynamicPanel({
      id: "panel-dyn-2",
      initialPx: 360,
      unpinned: true,
    });
    await waitForSize(seen, "panel-dyn-2", 360);
    const [minimum, maximum] = widthClampOf("panel-dyn-2");
    expect(minimum).not.toBe(maximum);
    expect(minimum).not.toBe(360 + GROUP_GAP_PX);

    engine.addDynamicPanel(DYN);
    expect(widthClampOf("panel-dyn-1")).toEqual([
      360 + GROUP_GAP_PX,
      360 + GROUP_GAP_PX,
    ]);
    touchContainer(opts.container);
    engine.dispose();
    expect(seen.pins()).toEqual([
      { panelIds: ["panel-dyn-1"], px: 360, axis: "width" },
    ]);
  });

  it("reconciles an `unpinned` construction-time dynamic panel without a design pin", () => {
    const seen = trackLayout();
    persistArranged({
      ...createBase(),
      ...seen.options,
      dynamicPanels: [{ id: "panel-dyn-2", initialPx: 360, unpinned: true }],
    });

    expect(seen.sizeOf("panel-dyn-2")).toBe(360);
    expect(seen.pins()).toEqual([]);
  });

  it("forces a dynamic panel added during a live maximize into a strip, and restores it on exit", async () => {
    // In-house parity: a panel docked while a maximize is live must not land
    // full-size beside a dock of 32px strips — it joins the maximize's own
    // strip set via the same recordStrip path maximizePanel itself uses.
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({
      ...createBase(),
      ...seen.options,
      ...strips.options,
    });
    const ratesBefore = baselineSize(createBase(), "fx-rates");

    engine.maximizePanel("fx-rates");
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", STRIP);
    expect(strips.last["panel-dyn-1"]).toBe("vertical");

    engine.exitMaximize();
    await waitForSize(seen, "panel-dyn-1", 360);
    await waitForSizeWithin(seen, "fx-rates", ratesBefore, 8);
    engine.dispose();
  });

  const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;
});

describe("unpinned dynamic panels share their split (R17)", () => {
  it("1920, two instances opened together: the pinned picture (main 869, 360/360)", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    expect(cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft"])).toEqual([
      869,
      RAIL_PX,
      360,
      360,
    ]);
    expectDockFilled(1907, ["eq-chart", "eq-ticket", "i-aapl", "i-msft"]);
    engine.dispose();
  });

  it("1920, two instances opened one call apart: the same pinned picture, and neither is left min=max", async () => {
    const engine = createDockEngine(equitiesAt(1907));
    engine.addDynamicPanel(INSTANCES[0] as (typeof INSTANCES)[number]);
    await nextMacrotask();
    engine.addDynamicPanel(INSTANCES[1] as (typeof INSTANCES)[number]);

    expect(cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft"])).toEqual([
      869,
      RAIL_PX,
      360,
      360,
    ]);

    for (const id of ["i-aapl", "i-msft"]) {
      const [minimum, maximum] = widthClampOf(id);
      expect(minimum).not.toBe(maximum);
    }

    engine.dispose();
  });

  it("1920, four instances: instances and main share equally, filling the dock exactly", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES,
    });

    expectEqualShares(ids, 4);
    expect(cardWidths(["eq-ticket"])).toEqual([RAIL_PX]);
    expectDockFilled(1907, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("1440, four instances: equal shares, nothing overflows the right edge", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    expectEqualShares(ids, 4);
    expect(cardWidths(["eq-ticket"])).toEqual([RAIL_PX]);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("closing one of four instances re-shares the split among the remaining three", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.removeDynamicPanel("i-nvda");

    expectEqualShares(ids, 3);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("a pinned Jarvis dock beside the instances keeps its design width and its pin", () => {
    const opts = equitiesAt(1907);
    const seen = trackLayout();
    const engine = createDockEngine({
      ...opts,
      ...seen.options,
      dynamicPanels: [{ id: "panel-dyn-1", initialPx: 360 }, ...INSTANCES],
    });
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];

    expect(cardWidths(["panel-dyn-1"])).toEqual([360]);
    expect(widthClampOf("panel-dyn-1")).toEqual([
      360 + GROUP_GAP_PX,
      360 + GROUP_GAP_PX,
    ]);
    expectEqualShares(ids, 4);
    expectDockFilled(1907, ["eq-ticket", "panel-dyn-1", ...ids]);
    touchContainer(opts.container);
    engine.dispose();
    expect(seen.pins()).toEqual([
      { panelIds: ["eq-ticket", "eq-watchlist"], px: RAIL_PX, axis: "width" },
      { panelIds: ["panel-dyn-1"], px: 360, axis: "width" },
    ]);
  });

  it("a split with a pinned rail and a strip keeps both untouched while instances are equalised", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const strips = recordStrips();
    const engine = createDockEngine({
      ...equitiesAt(1907),
      ...strips.options,
      seed: {
        kind: "split",
        dir: "row",
        sizes: [0.6, 0.2, 0.2],
        initialPx: [undefined, 290, undefined],
        children: [
          EQUITIES_LIKE.children[0],
          EQUITIES_LIKE.children[1],
          { kind: "panel", panelId: "eq-news" },
        ],
      },
    });

    engine.collapsePanel("eq-news");
    expect(strips.last).toEqual({ "eq-news": "vertical" });

    for (const instance of INSTANCES) {
      engine.addDynamicPanel(instance);
    }

    expect(cardWidths(["eq-ticket", "eq-news"])).toEqual([RAIL_PX, STRIP]);
    expect(widthClampOf("eq-ticket")).toEqual([
      RAIL_PX + GROUP_GAP_PX,
      RAIL_PX + GROUP_GAP_PX,
    ]);
    expectEqualShares(ids, 4);
    expectDockFilled(1907, ["eq-ticket", "eq-news", ...ids]);
    engine.dispose();
  });

  it("R18 nearest-column maximize → open an instance → exit: the split is re-shared", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      panels: { ...createBase().panels, maximizeScope: railColumnScope },
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-watchlist");
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    engine.exitMaximize();

    expect(
      cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft", "i-nvda"]),
    ).toEqual(ROOM_FOR_THREE);
    engine.dispose();
  });

  // A nearest-column maximize strips only its OWN column. A chart opened
  // meanwhile lands at the root's right edge — outside that column — and
  // must arrive as a full panel, not a strip (the inherited #724 gap:
  // insertDynamicPanel routed every newcomer through the maximize's strip
  // path whatever its boundary; reachable by maximizing the watchlist, which
  // hosts the open-chart button, then opening a chart).
  it("a chart opened outside a nearest-column maximize's column arrives as a full panel", () => {
    const strips = recordStrips();
    const engine = createDockEngine({
      ...equitiesAt(1907),
      ...strips.options,
      panels: { ...createBase().panels, maximizeScope: railColumnScope },
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-watchlist");

    const strippedByMaximize = Object.keys(strips.last).sort();

    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);

    expect(strips.last).not.toHaveProperty(INSTANCES[2]?.id as string);
    expect(Object.keys(strips.last).sort()).toEqual(strippedByMaximize);
    engine.dispose();
  });

  it("R18 root maximize → open an instance → exit: the split is re-shared", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-chart");
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    engine.exitMaximize();

    expect(
      cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft", "i-nvda"]),
    ).toEqual(ROOM_FOR_THREE);
    expectDockFilled(1907, [
      "eq-chart",
      "eq-ticket",
      "i-aapl",
      "i-msft",
      "i-nvda",
    ]);
    engine.dispose();
  });

  it("R18 maximize an instance → open a fifth → exit: five equal shares", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla", "i-goog"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.maximizePanel("i-aapl");
    engine.addDynamicPanel({ id: "i-goog", initialPx: 360, unpinned: true });
    engine.exitMaximize();

    expectEqualShares(ids, 5);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R18 root maximize → close a non-owner instance → exit: three equal shares", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.maximizePanel("eq-chart");
    engine.removeDynamicPanel("i-nvda");
    engine.exitMaximize();

    expectEqualShares(ids, 3);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R18 maximize an instance → close it: the survivors share equally", () => {
    const ids = ["eq-chart", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.maximizePanel("i-aapl");
    engine.removeDynamicPanel("i-aapl");

    expectEqualShares(ids, 3);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R18 collapse an instance → open two → expand it: four equal shares, none crushed", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.collapsePanel("i-aapl");
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    engine.addDynamicPanel(INSTANCES[3] as (typeof INSTANCES)[number]);
    engine.expandPanel("i-aapl");

    expectEqualShares(ids, 4);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R18 a column of stacked instances counts as ONE instance member", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });
    const dock = lastDockviewApi();
    const aapl = dock.getPanel("i-aapl");
    const msft = dock.getPanel("i-msft");

    if (aapl === undefined || msft === undefined) {
      throw new Error("fixture instances missing");
    }

    // The drop operation IS moveTo: stack MSFT under AAPL as a column.
    msft.api.moveTo({ group: aapl.group, position: "bottom" });
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    engine.addDynamicPanel(INSTANCES[3] as (typeof INSTANCES)[number]);

    // Main, rail, [AAPL over MSFT], NVDA, TSLA — three instance members.
    expect(
      cardWidths([
        "eq-chart",
        "eq-ticket",
        "i-aapl",
        "i-msft",
        "i-nvda",
        "i-tsla",
      ]),
    ).toEqual([502, RAIL_PX, 360, 360, 360, 360]);
    expectDockFilled(1907, [
      "eq-chart",
      "eq-ticket",
      "i-aapl",
      "i-nvda",
      "i-tsla",
    ]);
    engine.dispose();
  });

  it("R19 maximize eq-chart (root) with two untouched instances → exit: the rule's picture, not a crushed last instance", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-chart");
    engine.exitMaximize();

    expect(cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft"])).toEqual([
      869,
      RAIL_PX,
      360,
      360,
    ]);
    expectDockFilled(1907, ["eq-chart", "eq-ticket", "i-aapl", "i-msft"]);
    engine.dispose();
  });

  it("R19 maximize eq-chart (root) with four instances at 1440 → exit: equal shares", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.maximizePanel("eq-chart");
    engine.exitMaximize();

    expectEqualShares(ids, 4);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R19 switch the maximize from eq-chart to an instance → exit: the rule's picture", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-chart");
    engine.maximizePanel("i-aapl");
    engine.exitMaximize();

    expect(cardWidths(["eq-chart", "eq-ticket", "i-aapl", "i-msft"])).toEqual([
      869,
      RAIL_PX,
      360,
      360,
    ]);
    engine.dispose();
  });

  it("R19 maximize an instance (root scope) with four open → exit: equal shares", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const engine = createDockEngine({
      ...equitiesAt(1427),
      dynamicPanels: INSTANCES,
    });

    engine.maximizePanel("i-nvda");
    engine.exitMaximize();

    expectEqualShares(ids, 4);
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R19 a maximize that strips no instance, and a plain collapse → expand, leave a user-resized instance alone", () => {
    // R19's narrower guarantee: only a maximize that STRIPS an instance owes
    // a share. A nearest-column maximize of the rail's watchlist strips the
    // ticket above it and nothing in the root row, so the dragged width
    // survives; so does a collapse → expand with no instance opened/closed.
    const engine = createDockEngine({
      ...equitiesAt(1907),
      panels: { ...createBase().panels, maximizeScope: railColumnScope },
      dynamicPanels: INSTANCES.slice(0, 2),
    });
    const aapl = lastDockviewApi().getPanel("i-aapl");

    if (aapl === undefined) {
      throw new Error("fixture instance missing");
    }

    aapl.group.api.setSize({ width: 500 + GROUP_GAP_PX }); // a sash drag
    const dragged = cardWidths(["eq-chart", "i-aapl", "i-msft"]);
    expect(dragged[1]).toBe(500);

    engine.maximizePanel("eq-watchlist");
    engine.exitMaximize();
    expect(cardWidths(["eq-chart", "i-aapl", "i-msft"])).toEqual(dragged);

    engine.collapsePanel("i-msft");
    engine.expandPanel("i-msft");
    expect(cardWidths(["eq-chart", "i-aapl", "i-msft"])).toEqual(dragged);
    engine.dispose();
  });

  it("R18 a dock too narrow for the shares clamps instances at their minimum, never below", () => {
    const engine = createDockEngine({
      ...equitiesAt(700),
      dynamicPanels: INSTANCES,
    });
    const dock = lastDockviewApi();

    for (const id of ["eq-chart", ...INSTANCES.map(idOf)]) {
      const group = dock.getPanel(id)?.group;

      expect(group?.api.width).toBeGreaterThanOrEqual(group?.minimumWidth ?? 0);
    }

    expect(new Set(cardWidths(INSTANCES.map(idOf))).size).toBe(1);
    engine.dispose();
  });

  it("R18 a split with no static member shares floor(U / n), the last instance taking the remainder", () => {
    const engine = createDockEngine(equitiesAt(1427));

    engine.closePanel("eq-chart");
    engine.closePanel("eq-blotter");
    // With only the pinned rail left, dockview clamps the whole grid to the
    // rail's max width; the first instance makes the root unbounded again,
    // and the container's resize settle (the engine's ResizeObserver path,
    // not this rule's) re-lays it out to the dock — stood in for here.
    engine.addDynamicPanel(INSTANCES[0] as (typeof INSTANCES)[number]);
    lastDockviewApi().layout(1427, 980);

    for (const instance of INSTANCES.slice(1, 3)) {
      engine.addDynamicPanel(instance);
    }

    // U = 1427 − the 297 rail model = 1130; floor(1130 / 3) = 376 (369 card).
    expect(cardWidths(["eq-ticket", "i-aapl", "i-msft", "i-nvda"])).toEqual([
      RAIL_PX,
      369,
      369,
      371,
    ]);
    expectDockFilled(1427, ["eq-ticket", "i-aapl", "i-msft", "i-nvda"]);
    engine.dispose();
  });

  it("R18 pinned dock → switch the maximize to another pinned dock → exit: both clamps restored", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: [
        { id: "panel-dyn-1", initialPx: 360 },
        { id: "panel-dyn-2", initialPx: 360 },
      ],
    });

    engine.maximizePanel("panel-dyn-1");
    engine.maximizePanel("panel-dyn-2");
    expect(widthClampOf("panel-dyn-2")).not.toEqual([367, 367]);
    engine.exitMaximize();

    expect(widthClampOf("panel-dyn-1")).toEqual([367, 367]);
    expect(widthClampOf("panel-dyn-2")).toEqual([367, 367]);
    expect(cardWidths(["eq-chart", "panel-dyn-1", "panel-dyn-2"])).toEqual([
      869, 360, 360,
    ]);
    engine.dispose();
  });

  it("R18 pinned dock → switch the maximize to an unpinned instance → exit: nothing moves", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: [
        { id: "panel-dyn-1", initialPx: 360 },
        ...INSTANCES.slice(0, 2),
      ],
    });
    const before = cardWidths(["eq-chart", "panel-dyn-1", "i-aapl", "i-msft"]);

    engine.maximizePanel("panel-dyn-1");
    engine.maximizePanel("i-aapl");
    engine.exitMaximize();

    expect(before).toEqual([502, 360, 360, 360]);
    expect(cardWidths(["eq-chart", "panel-dyn-1", "i-aapl", "i-msft"])).toEqual(
      before,
    );
    expect(widthClampOf("panel-dyn-1")).toEqual([367, 367]);
    engine.dispose();
  });

  it("R18 maximize a pinned dock → collapse it → exit → expand: its clamp and width come back", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: [{ id: "panel-dyn-1", initialPx: 360 }],
    });

    engine.maximizePanel("panel-dyn-1");
    engine.collapsePanel("panel-dyn-1");
    engine.exitMaximize();
    expect(cardWidths(["panel-dyn-1"])).toEqual([STRIP]);
    engine.expandPanel("panel-dyn-1");

    expect(widthClampOf("panel-dyn-1")).toEqual([367, 367]);
    expect(cardWidths(["panel-dyn-1"])).toEqual([360]);
    engine.dispose();
  });

  // ——— R20: the rule is width-axis only, and owed shares are paid within
  // the action's own scope. ———

  it("R20 an instance dragged under eq-blotter keeps the column's heights through a root maximize of another instance", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    stackUnder("i-aapl", "eq-blotter");
    const before = sizesOf(["eq-chart", "eq-blotter", "i-aapl", "i-msft"]);
    expect(before.map(heightOf)).toEqual([645, 167, 168, 980]);

    engine.maximizePanel("i-msft");
    engine.exitMaximize();

    expect(sizesOf(["eq-chart", "eq-blotter", "i-aapl", "i-msft"])).toEqual(
      before,
    );
    engine.dispose();
  });

  it("R20 an instance dragged under eq-chart keeps the column's heights through a root maximize of eq-blotter", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    stackUnder("i-aapl", "eq-chart");
    const heights = sizesOf(["eq-chart", "eq-blotter", "i-aapl"]).map(heightOf);
    expect(heights).toEqual([322, 335, 323]);

    engine.maximizePanel("eq-blotter");
    engine.exitMaximize();

    expect(sizesOf(["eq-chart", "eq-blotter", "i-aapl"]).map(heightOf)).toEqual(
      heights,
    );
    engine.dispose();
  });

  it("R20 an instance dragged under eq-watchlist keeps the rail column's heights through its nearest-column maximize", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      panels: { ...createBase().panels, maximizeScope: railColumnScope },
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    stackUnder("i-aapl", "eq-watchlist");
    const before = sizesOf(["eq-ticket", "eq-watchlist", "i-aapl", "i-msft"]);
    expect(before.map(heightOf)).toEqual([490, 245, 245, 980]);

    engine.maximizePanel("eq-watchlist");
    engine.exitMaximize();

    expect(sizesOf(["eq-ticket", "eq-watchlist", "i-aapl", "i-msft"])).toEqual(
      before,
    );
    engine.dispose();
  });

  it("R20 closing an instance in a mixed column never shares the column's heights", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 3),
    });

    stackUnder("i-aapl", "eq-blotter");
    stackUnder("i-msft", "eq-blotter");
    engine.removeDynamicPanel("i-msft");

    const heights = sizesOf(["eq-chart", "eq-blotter", "i-aapl"]).map(heightOf);
    expect(heights).not.toContain(360 + GROUP_GAP_PX);
    expect(
      heights.reduce((sum, height) => {
        return sum + height;
      }, 0),
    ).toBe(980);
    engine.dispose();
  });

  // Phase-4 follow-up (a): collapsing a chart instance handed its WHOLE
  // freed width to the row's last unpinned member (dockview settles a size
  // change from the split's last view) — the neighbouring instance ballooned
  // until the collapsed one was expanded. The freed width belongs to the
  // static member, the main area; every other instance keeps the width it
  // had — including one the user dragged (R20), so this is not a re-share.
  it("collapsing an instance gives its width to the main area, leaving the other instances as they were", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    dragWidth("i-aapl", 420);

    const [chartBefore, aaplBefore, msftBefore] = cardWidths([
      "eq-chart",
      "i-aapl",
      "i-msft",
    ]);

    engine.collapsePanel("i-msft");

    const [chartAfter, aaplAfter] = cardWidths(["eq-chart", "i-aapl"]);

    expect(aaplAfter).toBe(aaplBefore);
    expect((chartAfter as number) - (chartBefore as number)).toBeGreaterThan(
      (msftBefore as number) - 60,
    );

    engine.expandPanel("i-msft");

    expect(cardWidths(["eq-chart", "i-aapl", "i-msft"])).toEqual([
      chartBefore,
      aaplBefore,
      msftBefore,
    ]);
    engine.dispose();
  });

  it("R20 a mark kept for a strip is not paid by an unrelated collapse → expand", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.collapsePanel("i-msft");
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    dragWidth("i-aapl", 500);
    const dragged = cardWidths(["eq-chart", "i-aapl", "i-nvda"]);
    expect(dragged).toEqual([830, 500, 220]);

    engine.collapsePanel("eq-blotter");
    engine.expandPanel("eq-blotter");

    expect(cardWidths(["eq-chart", "i-aapl", "i-nvda"])).toEqual(dragged);
    engine.dispose();
  });

  it("R20 deleting a Jarvis dock does not pay an instance split's mark", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: [
        { id: "panel-dyn-1", initialPx: 360 },
        ...INSTANCES.slice(0, 2),
      ],
    });

    engine.collapsePanel("i-msft");
    engine.addDynamicPanel(INSTANCES[2] as (typeof INSTANCES)[number]);
    dragWidth("i-aapl", 500);

    engine.removeDynamicPanel("panel-dyn-1");

    // Paying the kept mark would put AAPL back to its 360 design width.
    expect(cardWidths(["i-aapl"])).not.toEqual([360]);
    engine.dispose();
  });

  it("R20 closing the maximized eq-chart pays the maximize's owed shares like an exit", () => {
    const engine = createDockEngine({
      ...equitiesAt(1907),
      dynamicPanels: INSTANCES.slice(0, 2),
    });

    engine.maximizePanel("eq-chart");
    engine.closePanel("eq-chart");

    expect(cardWidths(["eq-blotter", "eq-ticket", "i-aapl", "i-msft"])).toEqual(
      [869, RAIL_PX, 360, 360],
    );
    engine.dispose();
  });

  // ——— R21: a container resize re-shares chart instances at the new width,
  // outside the settle-correction gates (reapplyExactLayoutOnResize). Opening
  // a chart instance is itself a pointerdown inside the dock — it already
  // sets userArranged — so a hook gated behind "!userArranged" would never
  // run for exactly the engines that hold instances. ———

  it("R21 a container resize re-shares four instances at the new width", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const opts = equitiesAt(1907);
    const engine = createDockEngine({ ...opts, dynamicPanels: INSTANCES });

    expectEqualShares(ids, 4); // baseline at 1907

    driveResize(opts.container, 1427, 980);

    expectEqualShares(ids, 4); // re-shared at 1427, without any open/close
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R21 the same resize re-shares even once the dock is user-arranged", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const opts = equitiesAt(1907);
    const engine = createDockEngine({ ...opts, dynamicPanels: INSTANCES });

    // Proves the share runs OUTSIDE the settle-correction gates: touch the
    // container the way a real sash drag or click would, so userArranged is
    // true independent of whatever opening the instances above already did.
    touchContainer(opts.container);
    expectEqualShares(ids, 4); // baseline at 1907

    driveResize(opts.container, 1427, 980);

    expectEqualShares(ids, 4); // still re-shared, even though userArranged
    expectDockFilled(1427, ["eq-ticket", ...ids]);
    engine.dispose();
  });

  it("R21 a nearest-column maximize elsewhere still lets a resize re-share the instances", () => {
    const ids = ["eq-chart", "i-aapl", "i-msft", "i-nvda", "i-tsla"];
    const opts = equitiesAt(1907);
    const engine = createDockEngine({
      ...opts,
      panels: { ...createBase().panels, maximizeScope: railColumnScope },
      dynamicPanels: INSTANCES,
    });

    // The rail's nearest-column maximize boundary contains only the rail
    // column (eq-ticket/eq-watchlist) — nothing of the instances' row. A
    // blanket "skip every share while ANY maximize is live" gate would still
    // block this, even though nothing in the instances' split is a strip.
    engine.maximizePanel("eq-watchlist");

    driveResize(opts.container, 1427, 980);

    expectEqualShares(ids, 4);
    engine.dispose();
  });

  // A root-maximize-of-an-instance regression test (mirroring the deleted
  // vacuous spec) is deliberately NOT included here: a root (or
  // container-falling-back nearest-column) maximize's own strip pass marks
  // every OTHER sibling in api.groups as a strip record, so
  // shareSplitAmongInstances always sees either zero live members (an
  // early return) or exactly one — the maximized member itself, with no
  // static member present — which its own formula computes back to its
  // current size exactly (`sharedTotal - share * (instances.length - 1)`
  // with `instances.length === 1` is `sharedTotal - 0`). Verified both by
  // this derivation and by mutation: deleting the boundary-scoping check
  // entirely and re-running a root-maximize-of-an-instance resize produces
  // byte-identical card widths before and after. The scoping check is
  // still correct and kept (see reapplyExactLayoutOnResize's comment) — it
  // stops the share rule from ever treating a maximized fill as an
  // ordinary instance, which today happens to be a no-op only as an
  // accident of the maximize mechanism, not a guarantee this rule should
  // lean on. The nearest-column test above is what actually depends on the
  // scoping (it fails on the pre-fix blanket gate); this one would not.

  /** Redefines `container`'s reported size and delivers the resize to every
   * ResizeObserver watching it — the same drive-the-observer idiom as the
   * "settle resize" describe above, reused here for the R21 share-on-resize
   * behaviour rather than the seed-correction one. */
  function driveResize(
    container: HTMLElement,
    width: number,
    height: number,
  ): void {
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      get: () => {
        return width;
      },
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      get: () => {
        return height;
      },
    });

    for (const observer of [...recordedObservers]) {
      if (observer.targets.includes(container)) {
        const entry = {
          target: container,
          contentRect: { width, height },
        } as unknown as ResizeObserverEntry;
        observer.callback([entry], observer as unknown as ResizeObserver);
      }
    }
  }

  /** Drops `panelId` under `targetId`'s group — the DnD's moveTo. */
  function stackUnder(panelId: string, targetId: string): void {
    const dock = lastDockviewApi();
    const moved = dock.getPanel(panelId);
    const target = dock.getPanel(targetId);

    if (moved === undefined || target === undefined) {
      throw new Error(`${panelId} or ${targetId} missing`);
    }

    moved.api.moveTo({ group: target.group, position: "bottom" });
  }

  /** A sash drag of `panelId`'s group to a `card` px width. */
  function dragWidth(panelId: string, card: number): void {
    lastDockviewApi()
      .getPanel(panelId)
      ?.group.api.setSize({ width: card + GROUP_GAP_PX });
  }

  /** Each panel's group `[card width, height]` on the live engine. */
  function sizesOf(
    panelIds: readonly string[],
  ): readonly (readonly [number, number])[] {
    return panelIds.map((panelId) => {
      const group = lastDockviewApi().getPanel(panelId)?.group;

      if (group === undefined) {
        throw new Error(`${panelId} is not in the dock`);
      }

      return [group.api.width - GROUP_GAP_PX, group.api.height] as const;
    });
  }

  function heightOf(size: readonly [number, number]): number {
    return size[1];
  }

  function railColumnScope(panelId: string): DockMaximizeScope {
    return panelId === "eq-ticket" || panelId === "eq-watchlist"
      ? "nearest-column"
      : "root";
  }

  function idOf(panel: DockDynamicPanel): string {
    return panel.id;
  }

  function equitiesAt(dockWidth: number): DockEngineOptions {
    return {
      ...createBase(),
      container: sizedContainer(dockWidth, 980),
      seed: EQUITIES_LIKE,
    };
  }

  /** Each panel's group card width (model − one gap) on the live engine. */
  function cardWidths(panelIds: readonly string[]): readonly number[] {
    return panelIds.map((panelId) => {
      const panel = lastDockviewApi().getPanel(panelId);

      if (panel === undefined) {
        throw new Error(`${panelId} is not in the dock`);
      }

      return panel.group.api.width - GROUP_GAP_PX;
    });
  }

  /** The root row's children (one representative panel each) fill the dock
   * to the pixel — no overflow past the right edge, no gap. */
  function expectDockFilled(
    dockWidth: number,
    rootChildPanelIds: readonly string[],
  ): void {
    const models = cardWidths(rootChildPanelIds).map((card) => {
      return card + GROUP_GAP_PX;
    });

    expect(
      models.reduce((sum, model) => {
        return sum + model;
      }, 0),
    ).toBe(dockWidth);
  }

  /** Every instance sits at one share `w`; the main area (first id) holds
   * `w` plus at most the integer remainder (fewer than `members` px). */
  function expectEqualShares(
    [mainId, ...instanceIds]: readonly string[],
    instanceCount: number,
  ): void {
    expect(instanceIds).toHaveLength(instanceCount);
    const [main = 0, ...instances] = cardWidths([mainId ?? "", ...instanceIds]);
    const share = instances[0] ?? 0;

    expect(share).toBeLessThan(360);
    expect(instances).toEqual(
      instances.map(() => {
        return share;
      }),
    );
    expect(main - share).toBeGreaterThanOrEqual(0);
    expect(main - share).toBeLessThan(instanceCount + 1);
  }

  // Instances get their design width; when there isn't room, instances and
  // the main area share equally. Pinned children (the 290px rail, a Jarvis
  // dock) and strips are never resized. Measured on the REAL equities seed
  // at the visual host's dock widths (1920 viewport → 1907, 1440 → 1427),
  // where jsdom reproduces the visual host's geometry exactly.
  const EQUITIES_LIKE = {
    kind: "split",
    dir: "row",
    sizes: [0.78, 0.22],
    initialPx: [undefined, 290],
    children: [
      {
        kind: "split",
        dir: "column",
        sizes: [0.66, 0.34],
        children: [
          { kind: "panel", panelId: "eq-chart" },
          { kind: "panel", panelId: "eq-blotter" },
        ],
      },
      {
        kind: "split",
        dir: "column",
        sizes: [0.5, 0.5],
        children: [
          { kind: "panel", panelId: "eq-ticket" },
          { kind: "panel", panelId: "eq-watchlist" },
        ],
      },
    ],
  } as const;

  const RAIL_PX = 290;

  const INSTANCES = ["i-aapl", "i-msft", "i-nvda", "i-tsla"].map((id) => {
    return { id, initialPx: 360, unpinned: true };
  });

  // ——— R18: the rule re-runs once geometry is restored after a maximize or
  // strip it was skipped under, stacked instance columns count once, the
  // share never drops below a group's minimum, and the no-static branch. ———

  const ROOM_FOR_THREE = [502, RAIL_PX, 360, 360, 360];
});

describe("dynamic-panel reconciliation at construction", () => {
  it("adds a listed dynamic panel missing from a fresh (null) blob", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({
      ...createBase(),
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.dispose();
  });

  it("keeps a listed dynamic panel's dragged arrangement from the blob", async () => {
    // engine 1: add, stack it into the rates group, capture the blob
    const seen = trackLayout();
    const firstOpts = createBase();
    const first = createDockEngine({
      ...firstOpts,
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    const api = lastDockviewApi();
    const dyn = api.getPanel("panel-dyn-1");
    const rates = api.getPanel("fx-rates");

    if (!dyn || !rates) {
      throw new Error("fixture panels missing");
    }

    dyn.api.moveTo({ group: rates.group, position: "center" }); // stack it
    expect(api.getPanel("panel-dyn-1")?.group.panels.length).toBe(2);
    // The stack stands in for a DnD, which starts with a pointer in the dock —
    // so dispose's final flush persists it (see baseline()).
    touchContainer(firstOpts.container);
    first.dispose();
    const blob = seen.blob();
    // engine 2: same blob + still listed → stays stacked, NOT re-added right-edge
    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
      ...reloaded.options,
      blob,
      dynamicPanels: [DYN],
    });
    const api2 = lastDockviewApi();
    expect(api2.getPanel("panel-dyn-1")?.group.panels.length).toBe(2);
    second.dispose();
  });

  it("removes a blob's dynamic panel that layer 2 no longer lists (orphan rule)", async () => {
    const seen = trackLayout();
    const first = createDockEngine({
      ...createBase(),
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    const blob = seen.blob();
    first.dispose();
    const second = createDockEngine({
      ...createBase(),
      ...trackLayout().options,
      blob,
    }); // no dynamicPanels
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    // statics intact
    expect(lastDockviewApi().getPanel("fx-rates")).toBeDefined();
    second.dispose();
  });

  it("scrubs an unrestorable dynamic node instead of degrading the whole tab to seed", async () => {
    // hand-corrupt ONLY the dynamic leaf in a real blob: a grid leaf VIEW
    // naming a panel with NO `panels` entry at all — a shape dockview's own
    // fromJSON genuinely throws on (unlike a merely-malformed panels entry,
    // which it tolerates by degrading that one panel to an undefined id).
    const seen = trackLayout();
    const firstOpts = createBase();
    const first = createDockEngine({
      ...firstOpts,
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    const api = lastDockviewApi();
    const rates = api.getPanel("fx-rates");
    const blotter = api.getPanel("fx-blotter");

    if (!rates || !blotter) {
      throw new Error("fixture panels missing");
    }

    // Give a STATIC pair a non-seed arrangement — stack blotter into rates'
    // own group. FX_LIKE's fresh conversion always puts them in SEPARATE
    // groups, so this can survive a reload ONLY via a genuine restore, never
    // via a seed fallback: the assertion below is unsatisfiable by seed,
    // unlike an earlier version of this test that (verified by the
    // reviewer aliasing `withoutDynamicNodes` to always return `null`)
    // passed identically whether the scrub ran or not — reconciliation
    // re-adds the dynamic panel via the SAME `insertDynamicPanel` path
    // either way, and that path's own right-edge redistribution overwrites
    // whatever ratio fx-analytics had BEFORE it ran, so a plain geometry
    // check on a panel adjacent to the dynamic one never discriminated the
    // two paths — this stack, on panels the dynamic panel's insertion never
    // touches, does.
    blotter.api.moveTo({ group: rates.group, position: "center" });
    expect(rates.group.panels.length).toBe(2);
    touchContainer(firstOpts.container); // a DnD's pointer, as above
    first.dispose();
    const parsed = JSON.parse(seen.blob());
    delete parsed.panels["panel-dyn-1"]; // unrestorable node: no panels entry
    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
      ...reloaded.options,
      blob: JSON.stringify(parsed),
      dynamicPanels: [DYN],
    });
    // The scrubbed retry succeeded (not seed): the dynamic panel layer 2
    // still lists is re-added at its right-edge width...
    await waitForSize(reloaded, "panel-dyn-1", 360);
    // ...and the static stack survived untouched — withoutDynamicNodes only
    // ever removes dynamic ids, so a leaf naming two static ids is never
    // touched by the scrub, unlike a seed fallback which could never
    // reproduce this arrangement at all.
    const ratesAfter = lastDockviewApi().getPanel("fx-rates");
    expect(ratesAfter?.group.panels.length).toBe(2);
    second.dispose();
  });

  it("does not degrade a single-panel seed tab to seed when its dock corrupts (root stays a branch)", async () => {
    // The real Admin-tab shape: a single-panel seed. With one Jarvis-docked
    // panel, its root serializes as exactly [static leaf, dynamic leaf] —
    // removing the corrupt dynamic leaf must not collapse that root down to
    // a bare leaf, which dockview's own fromJSON rejects outright ("root
    // must be of type branch"), forcing the whole tab to seed. A lone
    // panel has no other content to give it a non-seed SIZE (it always
    // fills 100% either way), so the discriminator here is its restored
    // GROUP ID: fromJSON restores a leaf's persisted `data.id` verbatim,
    // while a fresh seed build assigns its own auto id, oblivious to
    // anything the blob said — stamping a distinctive marker onto the
    // admin leaf before corrupting the blob makes scrub-success and seed
    // fallback unambiguously distinguishable.
    const seen = trackLayout();
    const first = createDockEngine({
      ...createBase(),
      seed: ADMIN_LIKE,
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    const parsed = JSON.parse(seen.blob());
    const adminLeaf = (
      parsed.grid.root.data as { data: { views: string[]; id: string } }[]
    ).find((leaf) => {
      return leaf.data.views.includes("admin");
    });

    if (!adminLeaf) {
      throw new Error("admin leaf missing from the captured blob");
    }

    adminLeaf.data.id = "g-admin-marker"; // only a real restore preserves this
    delete parsed.panels["panel-dyn-1"]; // unrestorable node: no panels entry
    first.dispose();
    const reloaded = trackLayout();
    const second = createDockEngine({
      ...createBase(),
      seed: ADMIN_LIKE,
      ...reloaded.options,
      blob: JSON.stringify(parsed),
      dynamicPanels: [DYN],
    });

    expect(lastDockviewApi().getPanel("admin")?.group.id).toBe(
      "g-admin-marker",
    );
    await waitForSize(reloaded, "panel-dyn-1", 360);
    second.dispose();
  });

  it("leaves a static-only blob with no dynamicPanels exactly as before", () => {
    // Capture a REAL blob first. An earlier version read the tracker
    // synchronously right after construction, before any save could land:
    // it compared null to null and restored from an empty-string "blob" that
    // silently fell back to the seed — green without ever testing a restore.
    const seen = trackLayout();
    persistArranged({ ...createBase(), ...seen.options });
    const analyticsBefore = seen.sizeOf("fx-analytics");
    expect(analyticsBefore).not.toBeNull();

    const reloaded = trackLayout();
    const opts = { ...createBase(), ...reloaded.options, blob: seen.blob() };
    const second = createDockEngine(opts);
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    touchContainer(opts.container);
    second.dispose();
    // the static arrangement itself is untouched — not just "no phantom
    // dynamic panel", but the SAME layout, byte for byte on this panel.
    expect(reloaded.sizeOf("fx-analytics")).toBe(analyticsBefore);
  });

  const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;
});

const capturedDockview = vi.hoisted(() => {
  return { api: null as unknown, options: null as unknown };
});

// Passthrough capture of the engine's dockview api: behaviour is untouched,
// but tests get a handle for `moveTo` — the operation a DROP performs
// (audit-verified). jsdom has no DragEvent/DataTransfer, so a real drag
describe("stacked visual fixture (Phase 2)", () => {
  // Seeded with RAIL_LIKE, not createBase()'s FX_LIKE: the fixture blob carries
  // all four real FX panels, and a panel a blob names but the SEED does not
  // is a dynamic node — the construction-time reconciliation scrubs it as an
  // orphan when no `dynamicPanels` entry claims it. RAIL_LIKE is the real FX
  // tab's shape, which is what the visual wrapper actually seeds.
  it("loads the stacked visual fixture blob: 3 groups, rates+analytics stacked, rates active", () => {
    const engine = createDockEngine({
      ...createBase(),
      seed: RAIL_LIKE,
      blob: STACKED_FX_BLOB,
    });
    const dock = lastDockviewApi();

    expect(engine.groupCount()).toBe(3);
    const rates = dock.getPanel("fx-rates");
    const analytics = dock.getPanel("fx-analytics");

    if (rates === undefined || analytics === undefined) {
      throw new Error("fixture panels missing");
    }

    expect(analytics.group).toBe(rates.group);
    expect(rates.group.panels).toHaveLength(2);
    expect(rates.group.activePanel?.id).toBe("fx-rates");

    // No save assertion here: loading a blob is a restore, not a change
    // (no onDidLayoutChange fires) — blob-format stability across a real
    // save/reload cycle is the #670 reload suite's job.
    engine.dispose();
  });

  // The shell/layout-dockview-stacked scenario seeds BOTH clients' wrappers
  // with this exact blob (tests/ui/visual/*/stackedFxBlob.ts, duplicated by
  // the wrappers' self-contained convention). This test is the fixture's
  // shape witness: if the blob format ever moves, fixture and test fail
  // together, loudly, here.
  // Spelled as a literal + `JSON.stringify` rather than a minified string
  // so the shape this test witnesses is readable; `JSON.stringify` emits
  // the captured blob byte for byte (key order is insertion order). The
  // `rtc*` keys are the wrapper's own sidecar, hence the intersection.
  /** A serialized Dockview grid plus the wrapper's own sidecar keys — what
   * a save actually stamps (see dockBlob.ts). Dockview's own type covers
   * only the `grid`/`panels`/`activeGroup` half. */
  type RtcDockBlob = SerializedDockview & {
    rtcBlobVersion: number;
    rtcDesignPins: readonly unknown[];
  };

  const STACKED_FX_LAYOUT: RtcDockBlob = {
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              {
                type: "leaf",
                data: {
                  views: ["fx-rates", "fx-analytics"],
                  activeView: "fx-rates",
                  id: "group-1",
                },
                size: 419,
              },
              {
                type: "leaf",
                data: {
                  views: ["fx-blotter"],
                  activeView: "fx-blotter",
                  id: "group-2",
                },
                size: 281,
              },
            ],
            size: 942,
          },
          {
            type: "leaf",
            data: {
              views: ["fx-positions"],
              activeView: "fx-positions",
              id: "group-4",
            },
            size: 318,
          },
        ],
        size: 700,
      },
      width: 1260,
      height: 700,
      orientation: Orientation.HORIZONTAL,
    },
    panels: {
      "fx-rates": {
        id: "fx-rates",
        contentComponent: "rtc-panel",
        title: "fx-rates",
      },
      "fx-analytics": {
        id: "fx-analytics",
        contentComponent: "rtc-panel",
        title: "fx-analytics",
      },
      "fx-blotter": {
        id: "fx-blotter",
        contentComponent: "rtc-panel",
        title: "fx-blotter",
      },
      "fx-positions": {
        id: "fx-positions",
        contentComponent: "rtc-panel",
        title: "fx-positions",
      },
    },
    activeGroup: "group-1",
    rtcBlobVersion: 2,
    rtcDesignPins: [],
  };

  const STACKED_FX_BLOB = JSON.stringify(STACKED_FX_LAYOUT);
});

/** The dockview api of the most recently created engine — captured by the
 * module mock above. */
describe("close/reopen (the layer-2 closed set, Phase 3)", () => {
  it("closePanel removes the panel and reopenPanel restores it beside its seed sibling", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({
      ...createBase(),
      seed: RAIL_LIKE,
      ...seen.options,
    });
    const dock = lastDockviewApi();

    engine.closePanel("fx-analytics");
    expect(dock.getPanel("fx-analytics")).toBeUndefined();
    expect(engine.groupCount()).toBe(3);

    engine.reopenPanel("fx-analytics");
    expect(dock.getPanel("fx-analytics")).toBeDefined();
    // Anchored to fx-positions (its seed rail sibling), sharing the rail column.
    expect(columnOf("fx-analytics")).not.toBeNull();
    expect(columnOf("fx-analytics")).toBe(columnOf("fx-positions"));
    engine.dispose();
  });

  it("closing a collapsed panel releases its strip; closing the maximized panel exits maximize", async () => {
    const strips: DockStripMap[] = [];
    const engine = createDockEngine({
      ...createBase(),
      seed: RAIL_LIKE,
      onStripsChange: (map: DockStripMap): void => {
        strips.push(map);
      },
    });
    const dock = lastDockviewApi();

    engine.collapsePanel("fx-blotter");
    expect(strips.at(-1)).toEqual({ "fx-blotter": "horizontal" });

    engine.closePanel("fx-blotter");
    expect(dock.getPanel("fx-blotter")).toBeUndefined();
    // The strip record went with the panel — no orphan restore bar.
    expect(strips.at(-1)).toEqual({});

    engine.maximizePanel("fx-rates");
    expect(strips.at(-1)).not.toEqual({});
    engine.closePanel("fx-rates");
    expect(dock.getPanel("fx-rates")).toBeUndefined();
    // Closing the maximized panel exits the maximize: its forced strips
    // restore rather than staying bars with nothing maximized.
    expect(strips.at(-1)).toEqual({});
    engine.dispose();
  });

  it("reopen lands at the right edge when the whole grid emptied out", () => {
    const engine = createDockEngine(createBase());
    const dock = lastDockviewApi();

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");
    engine.closePanel("fx-analytics");
    expect(engine.groupCount()).toBe(0);

    engine.reopenPanel("fx-rates");
    expect(dock.getPanel("fx-rates")).toBeDefined();
    expect(engine.groupCount()).toBe(1);
    engine.dispose();
  });

  it("the blob round-trips a closed-panel layout and reopen after reload still anchors at the seed sibling", async () => {
    const seen = trackLayout();
    const first = createDockEngine({
      ...createBase(),
      seed: RAIL_LIKE,
      ...seen.options,
    });

    first.closePanel("fx-analytics");
    await waitForSaves(seen);
    first.dispose();

    const second = createDockEngine({
      ...createBase(),
      seed: RAIL_LIKE,
      blob: seen.blob(),
    });
    const dock = lastDockviewApi();
    expect(dock.getPanel("fx-analytics")).toBeUndefined();

    second.reopenPanel("fx-analytics");
    expect(dock.getPanel("fx-analytics")).toBeDefined();
    expect(columnOf("fx-analytics")).toBe(columnOf("fx-positions"));
    second.dispose();
  });
});

/**
 * A design pin is a RELATIVE width: the rail holds its pixels while some
 * other panel absorbs whatever the container has spare. Close the last
 * absorber and the pin — which is min=max — leaves the grid with no child
 * able to take the remaining space, so dockview shrinks the WHOLE GRID to
 * the pinned extent and the dock shows a void beside it.
 *
 * Measured on the `RAIL_LIKE` seed pinned at 360 in a 1200-wide dock:
 *
 *   seed                      dock 1200 :: rates 833 | blotter 833 | rail 367
 *   close fx-rates            dock 1200 :: blotter 833 | rail 367
 *   close fx-blotter          dock  367 :: rail 367            ← 833px gone
 *
 * The same seed with NO pin keeps the dock at 1200 and hands the rail all
 * 1200, which is the control proving the pin is the cause.
 *
 * STATUS Phase-4 follow-up (b).
 */
describe("closing the last absorber releases a design pin (follow-up b)", () => {
  it("holds the pin while an absorber survives", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.closePanel("fx-rates");

    // fx-blotter is still there to absorb: the rail keeps its design width
    // and the grid still fills the dock.
    expect(dockWidth()).toBe(1200);
    expect(widthOf("fx-analytics")).toBe(367);
    engine.dispose();
  });

  it("fills the dock once the last absorbing panel is closed", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");

    // Nothing is left to absorb, so the pin yields — exactly as a sash drag
    // makes it yield — rather than starving the grid.
    expect(dockWidth()).toBe(1200);
    expect(widthOf("fx-analytics")).toBe(1200);
    engine.dispose();
  });

  it("re-clamps the pin when a reopened panel can absorb again", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");
    expect(widthOf("fx-analytics")).toBe(1200);

    // SUSPENDED, not forgotten: the moment something can absorb again, the
    // rail goes back to its design width. This is why the fix cannot simply
    // drop the pin — R18's "close both statics, then open a chart instance"
    // path depends on the rail still being 360 when the instance lands.
    engine.reopenPanel("fx-blotter");

    expect(widthOf("fx-analytics")).toBe(367);
    engine.dispose();
  });

  it("keeps a suspended pin in the blob, so a reload still knows the width", () => {
    const opts = createPinnedRailBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");
    touchContainer(opts.container);
    engine.dispose();

    // The clamp is lifted, but the design width is not lost — persisting it
    // is the difference between "suspended" and "released".
    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
    ]);
  });

  it("does not count a panel in another window as an absorber", () => {
    // jsdom cannot open a real pop-out window, so stand the state in the way
    // the ENGINE reads it: dockview reports a group's real home through
    // `api.location.type`, and `api.groups` is NOT pruned when a group leaves
    // the grid — the same read `publishPoppedPanels` uses.
    //
    // The stub can only lie about LOCATION, not vacate the pixels, so the
    // witness is the clamp itself rather than a width: a pin is min=max, and
    // suspending it is exactly what lifts that. Asserted against the same
    // sequence with the panel left in the grid, so the popout filter is the
    // only difference between the two.
    function railClampedAfterClosingRates(poppedOut: boolean): boolean {
      const engine = createDockEngine(createPinnedRailBase());
      const blotter = lastDockviewApi().getPanel("fx-blotter");

      if (blotter === undefined) {
        throw new Error("fx-blotter is not in the dock");
      }

      if (poppedOut) {
        Object.defineProperty(blotter.group.api, "location", {
          configurable: true,
          get: () => {
            return { type: "popout" };
          },
        });
      }

      engine.closePanel("fx-rates");

      const rail = lastDockviewApi().getPanel("fx-analytics");

      if (rail === undefined) {
        throw new Error("fx-analytics is not in the dock");
      }

      const clamped = rail.group.minimumWidth === rail.group.maximumWidth;
      engine.dispose();

      return clamped;
    }

    // In the grid, fx-blotter absorbs — the rail stays pinned.
    expect(railClampedAfterClosingRates(false)).toBe(true);
    // In another window it absorbs nothing here, so the pin must yield
    // rather than starve a grid that has nothing left to fill it.
    expect(railClampedAfterClosingRates(true)).toBe(false);
  });

  it("leaves an unpinned seed alone — the control", () => {
    const engine = createDockEngine(createRailBase());

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");

    expect(dockWidth()).toBe(1200);
    expect(widthOf("fx-analytics")).toBe(1200);
    engine.dispose();
  });

  function dockWidth(): number {
    return lastDockviewApi().width;
  }

  function widthOf(panelId: string): number {
    const panel = lastDockviewApi().getPanel(panelId);

    if (panel === undefined) {
      throw new Error(`${panelId} is not in the dock`);
    }

    return panel.group.api.width;
  }
});

describe("pop-out windows (session-scoped, the strips precedent)", () => {
  // jsdom can witness ONLY the popup-blocked branch: window.open returns
  // null here, so dockview's addPopoutGroup resolves false and touches
  // nothing. The opened-window path — stylesheet copy, DOM movement,
  // dock-home on close — is the e2e popup smoke's job (plan Task 7).
  it("popoutPanel resolves false under a blocked window.open and leaves the grid intact", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => {
      return null;
    });
    const popped: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createBase(),
      onPopoutsChange: (panelIds: readonly string[]): void => {
        popped.push(panelIds);
      },
    });
    const before = engine.groupCount();

    await expect(engine.popoutPanel("fx-analytics")).resolves.toBe(false);

    expect(engine.groupCount()).toBe(before);
    expect(popped).toEqual([]);
    engine.dispose();
    opened.mockRestore();
  });

  it("popoutPanel on an unknown panel resolves false without touching dockview", async () => {
    const engine = createDockEngine(createBase());
    const before = engine.groupCount();

    await expect(engine.popoutPanel("nope")).resolves.toBe(false);

    expect(engine.groupCount()).toBe(before);
    engine.dispose();
  });

  it("threads popoutUrl into dockview's create options", () => {
    createDockEngine({ ...createBase(), popoutUrl: "/popout.html" }).dispose();

    expect((capturedDockview.options as PopoutUrlCarrier).popoutUrl).toBe(
      "/popout.html",
    );
  });

  it("collapse still round-trips after a blocked pop-out attempt (guards, not crashes)", async () => {
    // Characterisation half of the popped-panel no-op: jsdom cannot create
    // popped state, so this pins that the pop-out path's guards leave the
    // ordinary strip machinery untouched end-to-end.
    const opened = vi.spyOn(window, "open").mockImplementation(() => {
      return null;
    });
    const strips: DockStripMap[] = [];
    const engine = createDockEngine({
      ...createBase(),
      onStripsChange: (map: DockStripMap): void => {
        strips.push(map);
      },
    });

    await engine.popoutPanel("fx-analytics");
    engine.collapsePanel("fx-analytics");
    expect(strips.at(-1)).toEqual({ "fx-analytics": "vertical" });
    engine.expandPanel("fx-analytics");
    expect(strips.at(-1)).toEqual({});
    engine.dispose();
    opened.mockRestore();
  });
});

// Phase 6a Task 1: five facts about dockview-core@8.3.1's floating primitive
// that no amount of reading THIS repo answers — jsdom witnesses the full
// success path (unlike pop-out, addFloatingGroup is synchronous and needs no
// window.open; a floating group is an absolutely-positioned div in the SAME
// document), so these are real characterizations, not blocked-branch stubs.
describe("dockview floating groups (characterization of the 8.3.1 primitive)", () => {
  // Q1 + Q2 + Q5 (membership half): float a grid-resident group and inspect
  // what changed underneath.
  it("detaches a grid group in place, unchanged group count, still reporting floating", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });
    const api = lastDockviewApi();
    const before = api.getPanel("fx-analytics");

    if (before === undefined) {
      throw new Error("fx-analytics missing before float");
    }

    const gridBefore = api.groups.length;

    // No prior removal: passing the grid-resident group straight in.
    api.addFloatingGroup(before.group, {
      x: 40,
      y: 40,
      width: 420,
      height: 320,
    });

    const after = api.getPanel("fx-analytics");

    if (after === undefined) {
      throw new Error("fx-analytics missing after float");
    }

    const group = after.group;

    // Q1: addFloatingGroup detached the ALREADY-grid-resident group itself —
    // no separate removal call was made above, and the panel is still found
    // under the same group instance, now reporting "floating".
    expect(group.api.location.type).toBe("floating");
    // Q5: dockview's own group registry is unchanged in size — a floating
    // group stays a known "group object" (api.groups is "all group objects",
    // not "all grid-docked groups"); only the spatial grid loses it.
    expect(api.groups.length).toBe(gridBefore);
    engine.dispose();
  });

  // Q2, corrected: `.dv-split-view-container` is NOT a grid-only class —
  // dockview mounts a float through its own private nested gridview, which
  // gets that exact same class for its own single-view wrapper. So
  // `closest(".dv-split-view-container")` from the floated element is NOT
  // null (it finds the float's OWN wrapper) — the brief's sketch assumed
  // this class was grid-exclusive, and jsdom disproves that directly.
  // The real boundary: the floated element leaves the ORIGINAL grid's own
  // split-view subtree entirely, landing in a sibling `dv-floating-overlay-
  // host` layer that is still a descendant of the engine's own container.
  it("leaves the grid's own split-view subtree for dockview's private floating-overlay layer", () => {
    const container = sizedContainer(1440, 900);
    const engine = createDockEngine({ ...createBase(), container });
    const api = lastDockviewApi();
    const panel = api.getPanel("fx-analytics");

    if (panel === undefined) {
      throw new Error("fx-analytics missing");
    }

    // Captured BEFORE floating: every split-view-container that belongs to
    // the SEED grid itself (root row split + the rates/blotter column split).
    const gridSplitsBefore = [
      ...container.querySelectorAll(".dv-split-view-container"),
    ];

    expect(gridSplitsBefore.length).toBeGreaterThan(0); // sanity: grid has splits

    api.addFloatingGroup(panel.group, { x: 40, y: 40 });

    const floated = api.getPanel("fx-analytics");

    if (floated === undefined) {
      throw new Error("fx-analytics missing after float");
    }

    // None of the grid's OWN pre-existing splits contain the float anymore...
    for (const split of gridSplitsBefore) {
      expect(split.contains(floated.group.element)).toBe(false);
    }

    // ...it is still inside the engine's own mount point overall...
    expect(container.contains(floated.group.element)).toBe(true);
    // ...specifically inside dockview's dedicated floating-overlay layer,
    // a subtree entirely separate from the grid's own gridview.
    expect(
      floated.group.element.closest(".dv-floating-overlay-host"),
    ).not.toBeNull();
    engine.dispose();
  });

  // Q3: does toJSON/fromJSON round-trip an open float?
  it("round-trips a floating group through toJSON/fromJSON", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });
    const api = lastDockviewApi();
    const panel = api.getPanel("fx-analytics");

    if (panel === undefined) {
      throw new Error("fx-analytics missing");
    }

    api.addFloatingGroup(panel.group, { x: 40, y: 40 });

    const serialized = api.toJSON() as FloatCarryingLayout;

    expect(serialized.floatingGroups).toHaveLength(1);

    const restoreTarget = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });
    const restoreApi = lastDockviewApi();

    restoreApi.fromJSON(api.toJSON());
    const restoredPanel = restoreApi.getPanel("fx-analytics");

    if (restoredPanel === undefined) {
      throw new Error("fx-analytics missing after fromJSON restore");
    }

    // fromJSON restored the float, not just the panel: location reads
    // "floating" on the freshly-loaded engine too.
    expect(restoredPanel.group.api.location.type).toBe("floating");
    restoreTarget.dispose();
    engine.dispose();
  });

  // Q4: does a public DockviewApi method dock a float back to the grid?
  // dockviewComponent.d.ts:265-266 declares moveGroupOrPanel/moveGroup on
  // IDockviewComponent (the internal accessor) — neither is re-declared on
  // the public DockviewApi surface `lastDockviewApi()` returns.
  it("has no public moveGroupOrPanel to dock a float back to the grid", () => {
    const engine = createDockEngine(createBase());
    const api = lastDockviewApi();

    expect(
      (api as unknown as Record<string, unknown>).moveGroupOrPanel,
    ).toBeUndefined();
    engine.dispose();
  });

  it("has no public moveGroup to dock a float back to the grid", () => {
    const engine = createDockEngine(createBase());
    const api = lastDockviewApi();

    expect(
      (api as unknown as Record<string, unknown>).moveGroup,
    ).toBeUndefined();
    engine.dispose();
  });

  // Q4, the working mechanism: DockviewPanelApi.moveTo (already public, and
  // already used throughout this file for ordinary grid-to-grid drops) is
  // implemented on the internal accessor's moveGroupOrPanel underneath, so it
  // docks a FLOATED panel back onto a grid group too — no remove-and-reopen
  // needed. This is the real answer Task 2 should build on.
  it("panel.api.moveTo docks a floated panel back onto a grid group", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });
    const api = lastDockviewApi();
    const analytics = api.getPanel("fx-analytics");
    const rates = api.getPanel("fx-rates");

    if (analytics === undefined || rates === undefined) {
      throw new Error("fixture panels missing");
    }

    api.addFloatingGroup(analytics.group, { x: 40, y: 40 });
    expect(analytics.group.api.location.type).toBe("floating");

    analytics.api.moveTo({ group: rates.group, position: "bottom" });

    const docked = api.getPanel("fx-analytics");

    if (docked === undefined) {
      throw new Error("fx-analytics missing after moveTo");
    }

    expect(docked.group.api.location.type).toBe("grid");
    engine.dispose();
  });

  /** The half of `api.toJSON()`'s shape this suite asks about — dockview's
   * own `SerializedDockview` type does not declare `floatingGroups`, which is
   * itself part of what Q3 establishes. */
  interface FloatCarryingLayout {
    floatingGroups?: readonly unknown[];
  }
});

// Phase 6a Task 2: the engine's own float/dock surface built on the Task 1
// primitive above — floatPanel, dockPanel, and the onFloatsChange publish
// channel.
describe("DockEngine floatPanel / dockPanel / onFloatsChange", () => {
  it("floatPanel floats the panel's group and publishes the floating set", async () => {
    const floats: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      onFloatsChange: (panelIds: readonly string[]): void => {
        floats.push(panelIds);
      },
    });

    expect(engine.floatPanel("fx-analytics")).toBe(true);
    // api.onDidLayoutChange's own notification is microtask-deferred
    // (dockview-core's AsapEvent) — see the debounce test above.
    await Promise.resolve();

    expect(floats.at(-1)).toEqual(["fx-analytics"]);
    engine.dispose();
  });

  // A float persists (design §3.3), so a reload restores it through
  // `fromJSON` at CONSTRUCTION — no transition, no mutation after the
  // publisher subscribed. The floating set must still reach the client, or
  // the bridge renders the restored float with the docked control set
  // (Collapse/Maximize, no Dock) until some later float transition happens
  // to publish it. Asserted synchronously the moment construction returns,
  // with nothing awaited and nothing touched: that is when a bridge first
  // renders the head, so that is where the difference is observable.
  it("publishes a float the blob restored, at construction", () => {
    const seen = trackLayout();
    const opts = { ...createBase(), container: sizedContainer(1440, 900) };
    const first = createDockEngine({ ...opts, ...seen.options });

    first.floatPanel("fx-analytics");
    touchContainer(opts.container);
    first.dispose();

    const floats: (readonly string[])[] = [];
    const reloaded = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      blob: seen.blob(),
      onFloatsChange: (panelIds: readonly string[]): void => {
        floats.push(panelIds);
      },
    });

    // The float really came back (so an empty publish cannot mean "no
    // float to publish") ...
    expect(
      lastDockviewApi().getPanel("fx-analytics")?.group.api.location.type,
    ).toBe("floating");
    // ... and it was published, once, before anything else ran.
    expect(floats).toEqual([["fx-analytics"]]);
    reloaded.dispose();
  });

  it("publishes nothing at construction when nothing is floating", async () => {
    const floats: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      onFloatsChange: (panelIds: readonly string[]): void => {
        floats.push(panelIds);
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(floats).toEqual([]);
    engine.dispose();
  });

  it("floatPanel returns false for an unknown panel and publishes nothing", () => {
    const floats: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createBase(),
      onFloatsChange: (panelIds: readonly string[]): void => {
        floats.push(panelIds);
      },
    });

    expect(engine.floatPanel("nope")).toBe(false);

    expect(floats).toEqual([]);
    engine.dispose();
  });

  it("dockPanel returns a floating panel to its seed-home slot", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });
    const before = engine.groupCount();
    engine.floatPanel("fx-analytics");

    engine.dockPanel("fx-analytics");

    const api = lastDockviewApi();
    const docked = api.getPanel("fx-analytics");

    if (docked === undefined) {
      throw new Error("fx-analytics missing after dockPanel");
    }

    expect(docked.group.api.location.type).toBe("grid");
    // Symmetric with floatPanel's own Q5 finding (floating leaves
    // groupCount unchanged): dockview's moveGroupOrPanel, moving a
    // single-panel non-grid source group to an adjacent position, reuses
    // that SAME DockviewGroupPanel instance rather than allocating a new
    // one and orphaning the old — measured directly here, not assumed.
    expect(engine.groupCount()).toBe(before);
    engine.dispose();
  });
});

// Phase 6a Task 3: the §3.2 interplay matrix — how a float behaves against
// the pin, strip, maximize and instance-share machinery this engine already
// runs. Every witness here is CONSTRAINT STATE or BOOKKEEPING, never a
// geometry reading: jsdom lays nothing out, and a float cannot vacate its
// pixels for a sibling to grow into, so a width assertion would pass or fail
// for reasons that have nothing to do with these rules.
describe("floating groups against pins, strips, maximize and the share rule", () => {
  // R1 — a strip has no slot to build around a float and no home to restore
  // it to. The witness is the published strip map, not a size: `recordStrip`
  // + `settleStrips` is what would list the panel there.
  it("refuses to collapse a floating panel (R1)", () => {
    const strips: DockStripMap[] = [];
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      onStripsChange: (next: DockStripMap): void => {
        strips.push(next);
      },
    });

    engine.floatPanel("fx-analytics");
    engine.collapsePanel("fx-analytics");

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(strips).toEqual([]);
    engine.dispose();
  });

  // R2 — same refusal for a maximize. A maximize strips every OTHER group in
  // its boundary, so the witness is again the strip map: the refusal means
  // nothing anywhere was stripped.
  it("refuses to maximize a floating panel (R2)", () => {
    const strips: DockStripMap[] = [];
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      onStripsChange: (next: DockStripMap): void => {
        strips.push(next);
      },
    });

    engine.floatPanel("fx-analytics");
    engine.maximizePanel("fx-analytics");

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(strips).toEqual([]);
    engine.dispose();
  });

  // R3 — a float while a strip owns the grid has no coherent home to return
  // to, so the button path refuses outright.
  it("refuses to float while a maximize is live (R3)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.maximizePanel("fx-rates");

    expect(engine.floatPanel("fx-analytics")).toBe(false);
    expect(locationOf("fx-analytics")).toBe("grid");
    engine.dispose();
  });

  // R4, the control FIRST: dockview's own shift-drag gesture really does
  // float a group from a bare pointerdown in jsdom. Without this the guarded
  // test below would pass for the wrong reason — a gesture that never fires
  // is trivially "cancelled".
  it("shift-drag floats a group when no maximize is live (R4 control)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    shiftPointerDown(voidContainerOf("fx-analytics"));

    expect(locationOf("fx-analytics")).toBe("floating");
    engine.dispose();
  });

  // R4 — the gesture half of R3's refusal. Cancelled at the POINTERDOWN, in
  // the capture phase: dockview floats from that event directly (bailing
  // only when it is already defaultPrevented), so `onWillDragGroup` — which
  // fires from an HTML5 dragstart the gesture's own preventDefault stops —
  // never sees this at all.
  it("cancels the shift-drag float gesture while a maximize is live (R4)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.maximizePanel("fx-rates");
    shiftPointerDown(voidContainerOf("fx-analytics"));

    expect(locationOf("fx-analytics")).toBe("grid");
    engine.dispose();
  });

  // The veto's own SCOPE, which is a separate claim from the veto working.
  // On a group that is already floating, the identical shift-pointerdown is
  // dockview's REDOCK gesture rather than a create-a-float one: the void
  // container is that float's move handle, and its html5 drag source is
  // cancelled for a plain drag but NOT when shiftKey is held
  // (`dockview-core` VoidContainer's `isCancelled`). Preventing the default
  // there would break dragging a float home. The state is reachable — R7
  // deliberately permits maximizing a docked panel while a float is open — so
  // `defaultPrevented` is the witness, not the panel's location: the location
  // would not change on a mere pointerdown either way.
  it("leaves a float's own redock gesture alone while a maximize is live (R4 scope)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.floatPanel("fx-analytics");
    engine.maximizePanel("fx-rates");

    const event = shiftPointerDown(voidContainerOf("fx-analytics"));

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(event.defaultPrevented).toBe(false);
    engine.dispose();
  });

  // R8 — the mirror of R1, read from the other side: a collapsed panel is a
  // strip member and a float has no strip, so the two states are mutually
  // exclusive by construction. Floating a strip would carry its min=max bar
  // clamp into the float — a ~39px box no resize can open.
  it("refuses to float a collapsed panel (R8)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.collapsePanel("fx-analytics");

    expect(engine.floatPanel("fx-analytics")).toBe(false);
    expect(locationOf("fx-analytics")).toBe("grid");
    engine.dispose();
  });

  // R8's gesture half, through the SAME capture-phase veto R4 added — one
  // more condition on an existing mechanism. The gesture is attributed to a
  // specific group at pointerdown (the `.dv-groupview` enclosing the target),
  // and a strip is always alone in its group, so this refuses the collapsed
  // panel specifically rather than every shift-drag in a dock that holds one.
  it("cancels the shift-drag float gesture on a collapsed panel (R8)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.collapsePanel("fx-analytics");
    shiftPointerDown(voidContainerOf("fx-analytics"));

    expect(locationOf("fx-analytics")).toBe("grid");
    engine.dispose();
  });

  // ...and the attribution is real, not "veto everything while any panel is
  // collapsed": an UNCOLLAPSED sibling still floats by gesture while another
  // panel sits collapsed. Without this the conservative veto would pass the
  // test above for the wrong reason.
  it("still shift-drag floats an expanded panel while a sibling is collapsed (R8 control)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
    });

    engine.collapsePanel("fx-analytics");
    shiftPointerDown(voidContainerOf("fx-blotter"));

    expect(locationOf("fx-blotter")).toBe("floating");
    engine.dispose();
  });

  // R5 — a pin is min=max; carrying one into a float would hold the box at
  // the rail's design width and refuse every resize. The clamp IS the pin,
  // so lifting it is the whole observable effect.
  it("lifts a design pin's clamp when a member floats (R5)", () => {
    const engine = createDockEngine(createPinnedRailBase());

    expect(isWidthClamped("fx-analytics")).toBe(true);

    engine.floatPanel("fx-analytics");

    expect(isWidthClamped("fx-analytics")).toBe(false);
    engine.dispose();
  });

  it("re-clamps the suspended design pin when the float docks home (R5)", () => {
    const engine = createDockEngine(createPinnedRailBase());
    const clampBefore = widthClampOf("fx-analytics");

    engine.floatPanel("fx-analytics");
    engine.dockPanel("fx-analytics");

    expect(locationOf("fx-analytics")).toBe("grid");
    expect(widthClampOf("fx-analytics")).toEqual(clampBefore);
    engine.dispose();
  });

  // dockPanel's no-op path: with nothing grid-resident to dock onto, neither
  // move branch runs and the panel stays floating — so the re-clamp must not
  // run either. FX_LIKE's lone analytics leaf carries the pin by itself here,
  // so the record survives into floatSuspendedPins before the grid empties.
  //
  // A CALL CENSUS, not a clamp reading, and the reason is measured: on this
  // path the grid is necessarily empty (that is what makes dockPanel no-op),
  // and dockview discards `setConstraints` on a group with no grid view
  // backing it — the clamp reads [100, MAX] whether or not the re-clamp ran,
  // so a clamp assertion here passes for a reason unrelated to the guard. The
  // census sees the call itself.
  // Docking into an EMPTY grid lands the panel as the grid's root — Dock is
  // never a silent no-op (it used to be here, which stranded a tab whose
  // every panel had floated). The pin its float suspended stays suspended:
  // a lone pinned panel has nothing beside it to absorb the dock's spare
  // width, so clamping it would shrink the whole grid to the rail's 367px
  // (follow-up (b)'s bug) — R5's "re-clamp if it still applies" does not
  // apply.
  it("docks into an empty grid without re-clamping the pin nothing could absorb around (R5)", () => {
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      seed: { ...FX_LIKE, initialPx: [undefined, 360] },
    });

    engine.floatPanel("fx-analytics");
    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");
    engine.dockPanel("fx-analytics");

    expect(locationOf("fx-analytics")).toBe("grid");
    expect(isWidthClamped("fx-analytics")).toBe(false);
    engine.dispose();
  });

  // A suspended record's `ownerSplit` is a live DOM Element compared by
  // IDENTITY (`unpinSplit`, `suspendPinsHolding`), and the one filed at
  // construction is the FLOAT's private gridview wrapper, not the grid split
  // the pin shapes. Promotion must re-derive it.
  //
  // Where the difference becomes observable is the whole point of these two
  // tests, and it is exactly one place: the first sash drag in the declaring
  // split AFTER a reload-restored float has docked home. Not at construction
  // (the field is never read while suspended); not at dock-home (the clamp is
  // [367, 367] in the correct and the broken world alike — that IS the
  // intended state); not from the blob. Only `unpinSplit`'s identity compare
  // can tell a real split from the float's wrapper, so the assertion is the
  // clamp AFTER the drag.
  it("releases a reload-restored float's re-clamped pin on a sash drag (R5)", () => {
    const opts = createPinnedRailBase();
    const engine = createDockEngine({
      ...opts,
      blob: createBlobWithFloatedRail(),
    });

    engine.dockPanel("fx-analytics");

    // The re-clamp landed — the precondition, not the claim.
    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);

    dragSash(opts.container, ".dv-horizontal");

    // ...and a drag in the pin's own declaring split releases it, exactly as
    // it does for a pin that never floated. A stale ownerSplit leaves the rail
    // clamped min=max for the rest of the session with no way out.
    expect(widthClampOf("fx-analytics")).toEqual([
      100,
      Number.MAX_SAFE_INTEGER,
    ]);
    engine.dispose();
  });

  // The other orientation, and it has to name the RAIL'S OWN column to bind
  // to anything: a width pin is declared by the `.dv-horizontal` row, so the
  // rail's nested column is the nearest WRONG answer a re-derivation could
  // produce, and dragging that sash must leave the pin alone. Asserted with
  // `dragSashIn(columnOf(...))`, not `dragSash(".dv-vertical")` — the latter
  // grabs the rates/blotter column, which no defect in this diff could ever
  // name, so that version passed by construction. The live-path twin is
  // "leaves the rail pin alone when the drag is in a nested split".
  it("keeps a reload-restored float's pin through a drag in its own column (R5)", () => {
    const opts = createPinnedRailBase();
    const engine = createDockEngine({
      ...opts,
      blob: createBlobWithFloatedRail(),
    });

    engine.dockPanel("fx-analytics");
    dragSashIn(columnOf("fx-analytics"));

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  // R5 + Ruling 6 — floating's suspension is NOT the absorber suspension.
  // An absorber returning elsewhere in the dock re-clamps `unabsorbedPins`;
  // it must not reach a float, or a panel reopening across the dock would
  // snap the floating box back to its rail width.
  it("keeps a floated panel's pin lifted when an absorber returns elsewhere (R5)", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.floatPanel("fx-analytics");
    // Close and reopen an absorbing panel: settlePinAbsorption runs on both,
    // and its re-clamp pass is exactly what must not see this record.
    engine.closePanel("fx-rates");
    engine.reopenPanel("fx-rates");

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(isWidthClamped("fx-analytics")).toBe(false);
    engine.dispose();
  });

  // Ruling 10 — a float REMOVES an absorber exactly as a close does, so it
  // can starve the grid the same way, and suspending pins on panels this
  // call never named is the CORRECT outcome.
  it("suspends an untouched panel's pin when a float takes the last absorber (Ruling 10)", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.closePanel("fx-rates");

    expect(isWidthClamped("fx-analytics")).toBe(true);

    // fx-blotter is the last panel left able to absorb the container's spare
    // space; floating it starves the grid, so the rail's pin — which this
    // call never named — must yield rather than clamp the whole grid to 367.
    engine.floatPanel("fx-blotter");

    expect(isWidthClamped("fx-analytics")).toBe(false);
    engine.dispose();
  });

  // R5 through the GESTURE (final review I1). dockview's shift-drag floats
  // the group itself, inside its own `addFloatingGroup`, and never calls
  // `floatPanel` — so the rule has to live on the float transition, not on
  // the verb.
  //
  // The difference is observable at two points, asserted at both. (1) The
  // instant the gesture returns: a pin nobody suspended still holds the
  // floating box at [367, 367]. (2) After dockview's buffered layout-change
  // (a microtask), where `intactDesignPins` DISSOLVES a record whose member
  // no longer shares the rail — that is the permanent loss, and it only
  // surfaces later, as a dock-home that cannot re-clamp and a saved blob
  // with no pin. So the test lets the layout pass run before docking home.
  it("suspends a pin when its member floats by shift-drag, and keeps it for dock-home (R5, gesture)", async () => {
    const opts = createPinnedRailBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    expect(isWidthClamped("fx-analytics")).toBe(true);

    shiftPointerDown(voidContainerOf("fx-analytics"));

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(isWidthClamped("fx-analytics")).toBe(false);

    await nextMacrotask(); // dockview's buffered onDidLayoutChange has run

    engine.dockPanel("fx-analytics");

    expect(locationOf("fx-analytics")).toBe("grid");
    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);

    touchContainer(opts.container);
    engine.dispose();

    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
    ]);
  });

  // Ruling 10 through the gesture (final review I1): shift-dragging the LAST
  // absorber out starves the grid exactly as the button does. Observable the
  // moment the gesture returns — a rail still clamped min=max beside no
  // absorber is the #745 void — and it never self-heals, so there is no
  // later point that would read differently.
  it("suspends an untouched pin when a shift-drag floats the last absorber (Ruling 10, gesture)", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.closePanel("fx-rates");

    expect(isWidthClamped("fx-analytics")).toBe(true);

    shiftPointerDown(voidContainerOf("fx-blotter"));

    expect(locationOf("fx-blotter")).toBe("floating");
    expect(isWidthClamped("fx-analytics")).toBe(false);
    engine.dispose();
  });

  // The reverse direction (final review I1 + M4's residue): a float that goes
  // home through DOCKVIEW'S OWN move — the path a drag onto the grid, or a
  // pop-out window closing, takes — never reaches `dockPanel`. Its record
  // must still leave the float-suspended map and re-clamp. `panel.api.moveTo`
  // is exactly what the drop calls (`moveGroupOrPanel`), without the DnD
  // event plumbing jsdom cannot drive. Observable immediately on the move.
  it("re-clamps a float-suspended pin when dockview itself moves the float home (R5, gesture)", () => {
    const engine = createDockEngine(createPinnedRailBase());

    engine.floatPanel("fx-analytics");

    expect(isWidthClamped("fx-analytics")).toBe(false);

    const api = lastDockviewApi();
    const positions = api.getPanel("fx-positions");

    if (positions === undefined) {
      throw new Error("fx-positions is not in the dock");
    }

    api.getPanel("fx-analytics")?.api.moveTo({
      group: positions.group,
      position: "top",
    });

    expect(locationOf("fx-analytics")).toBe("grid");
    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  // Final review I2: a pin ALREADY absorber-suspended (Ruling 10 put it in
  // `unabsorbedPins`) when its member floats must move to the float's
  // suspension too. Otherwise the next absorber to return re-clamps it ONTO
  // the floating box, and the layout pass after that dissolves it for good.
  // Button-only reproduction, the reviewer's exact sequence. Observable at
  // the dock of fx-rates (the absorber returning) as a clamped float, and
  // again — permanently — at the dock-home of fx-analytics and in the blob.
  it("keeps an absorber-suspended pin with its member when that member floats (I2)", async () => {
    const opts = createPinnedRailBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    engine.floatPanel("fx-rates");
    engine.floatPanel("fx-blotter"); // last absorber: the pin is suspended
    engine.floatPanel("fx-analytics");
    engine.dockPanel("fx-rates"); // an absorber returns

    expect(locationOf("fx-analytics")).toBe("floating");
    expect(isWidthClamped("fx-analytics")).toBe(false);

    await nextMacrotask(); // dockview's buffered onDidLayoutChange has run

    engine.dockPanel("fx-analytics");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);

    touchContainer(opts.container);
    engine.dispose();

    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
    ]);
  });

  // Both SIDES of the round trip, deliberately in one test. Asserting only
  // the sidecar certifies half its own claim: the write is what this code
  // changed, and the read is `applyDesignPins` running over those pins at
  // construction with the float already restored by `fromJSON`. A test that
  // re-reads its own write would have missed exactly that.
  it("persists a float-suspended pin and restores it unclamped (R5)", () => {
    const opts = createPinnedRailBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    engine.floatPanel("fx-analytics");
    touchContainer(opts.container);
    engine.dispose();

    // Write side. Suspended, never forgotten — the same contract the absorber
    // suspension keeps. A float IS persisted (design §3.3), so the reload that
    // restores it must still know what to re-clamp when it docks home.
    expect(seen.pins()).toEqual([
      { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
    ]);

    const reloaded = createDockEngine({
      ...createPinnedRailBase(),
      blob: seen.blob(),
    });

    // Read side. The float came back (asserted first, so the clamp assertion
    // below cannot pass because there is no float to clamp), and it came back
    // UNCLAMPED — min=max on a floating group is the state R5 exists to
    // prevent, and construction is a second place that can create it.
    expect(locationOf("fx-analytics")).toBe("floating");
    expect(isWidthClamped("fx-analytics")).toBe(false);

    // ...and SUSPENDED rather than discarded: docking home re-clamps at the
    // design width, which only a record the load KEPT can do. This is what
    // separates "routed into the suspended list" from "skipped".
    reloaded.dockPanel("fx-analytics");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    reloaded.dispose();
  });

  // R6 — a floating chart instance leaves the equal-share rule. A SETTLED
  // RESIZE is the trigger, not another instance opening: the resize handler
  // is the one place the engine asks `instanceSplitOf` about an instance BY
  // ID (`for (const instanceId of unpinnedDynamicPanels.keys())`) instead of
  // reaching it through a grid split's children, so it is the only path where
  // the DOM walk can land on the float's own private gridview. An
  // addDynamicPanel trigger passes either way — the float is excluded
  // structurally there (`childViewsOf` of a GRID split never reaches it), so
  // that version of this test was vacuous and was replaced.
  //
  // The witness is a CALL CENSUS on the floated group's own sizing api: the
  // rule's only effect on a member is `setConstraints` + `setSize` (axisOf),
  // and it releases the constraints again, so nothing it does to a float
  // survives as readable state to assert on.
  it("never resizes a floating chart instance (R6)", () => {
    const { engine, container } = createEngineWithInstances();

    engine.floatPanel("i-aapl");

    const touched = spyOnGroupSizing("i-aapl");

    resizeContainerTo(container, 1200, 900);

    expect(touched.calls()).toEqual([]);
    engine.dispose();
  });

  // The exclusion is a property of WHERE the group is, not a one-way door:
  // back in the grid, the instance is shared like any other member AT ONCE.
  //
  // Observable the moment dockPanel returns, and deliberately NOT through a
  // resize: an earlier version of this test resized the container and
  // counted sizing calls, and passed because the RESIZE re-shares every
  // instance split — dockPanel itself did not (final review I4: docked home,
  // the row read 360/360/360/360 until the next resize). The witness is the
  // row's widths against the freshly-shared ones read before the float; jsdom
  // gives dockview a sized container here, so its split model has real
  // widths even though nothing paints. Also pins dockPanel's no-seed-home
  // branch — an instance has no seed slot, and docking it into another
  // group's tab stack would leave it outside the rule for good.
  it("re-enters the share rule the moment the instance docks home (R6)", () => {
    const { engine } = createEngineWithInstances();
    const shared = groupWidthsOf(ROW_WITH_INSTANCES);

    engine.floatPanel("i-aapl");
    engine.dockPanel("i-aapl");

    expect(locationOf("i-aapl")).toBe("grid");
    expect(groupWidthsOf(ROW_WITH_INSTANCES)).toEqual(shared);
    engine.dispose();
  });

  // R7 — floats are boxes OVER the grid, not grid members. The trap is that
  // a float stays inside this engine's own container, so the maximize
  // boundary's `contains` test says yes: without a location check the
  // maximize would clamp the float to a 32px bar.
  it("leaves a float untouched when a docked panel maximizes (R7)", () => {
    const strips: DockStripMap[] = [];
    const engine = createDockEngine({
      ...createBase(),
      container: sizedContainer(1440, 900),
      onStripsChange: (next: DockStripMap): void => {
        strips.push(next);
      },
    });

    engine.floatPanel("fx-analytics");
    engine.maximizePanel("fx-rates");

    expect(locationOf("fx-analytics")).toBe("floating");
    // fx-blotter IS a grid sibling inside the boundary, so the maximize must
    // still have stripped it — proving the maximize ran and the float alone
    // was spared, rather than the whole pass having quietly no-opped.
    expect(strips.at(-1)).toEqual({ "fx-blotter": "horizontal" });
    engine.dispose();
  });

  // A float wears exactly a grid card's chrome: its own 38px head, no
  // separate drag rail stacked on top (dockview's default "titlebar" handle
  // added a blank 22px bar nobody could tell was the only grip). The head
  // itself is the handle — see the moveFloatFromHead tests below.
  it("a float carries no separate drag rail above its head", () => {
    const container = sizedContainer(1440, 900);
    const engine = createDockEngine({ ...createBase(), container });

    engine.floatPanel("fx-analytics");

    expect(container.querySelector(".dv-resize-container")).not.toBeNull();
    expect(container.querySelector(".dv-floating-titlebar")).toBeNull();
    engine.dispose();
  });

  // Floating EVERY panel leaves the grid empty; Dock must still bring a
  // panel home (user report, 2026-09-19: "I can't unfloat them anymore").
  // The first to dock has no grid-resident seed sibling, so it becomes the
  // grid's new root; the rest then find it and return to their seed
  // positions around it.
  it("docks a panel home even when every panel in the tab is floating", () => {
    const container = sizedContainer(1440, 900);
    const engine = createDockEngine({ ...createBase(), container });
    const ids = ["fx-rates", "fx-blotter", "fx-analytics"];

    for (const id of ids) {
      engine.floatPanel(id);
    }

    expect(ids.map(locationOf)).toEqual(["floating", "floating", "floating"]);

    for (const id of ids) {
      engine.dockPanel(id);
    }

    expect(ids.map(locationOf)).toEqual(["grid", "grid", "grid"]);
    engine.dispose();
  });

  // A float POPS OUT: at most half the dock per axis (never larger than the
  // panel was), centred, each further float stepped 28px down-right. The
  // first cut detached in place, covering exactly the slot the panel left, so
  // floating looked like nothing had happened.
  it("opens a float centred at up to half the dock, cascading each further float", () => {
    const container = sizedContainer(1440, 900);
    const rects = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function rectFor(this: HTMLElement) {
        // A float box reads where its own style puts it, as a browser lays
        // out an absolutely positioned box — dockview re-measures it after
        // placing it and re-clamps from that reading. Every panel group
        // reads 900×600; everything else (the dock, the overlay host) reads
        // as the whole 1440×900 dock.
        if (this.classList.contains("dv-resize-container")) {
          return new DOMRect(
            Number.parseFloat(this.style.left) || 0,
            Number.parseFloat(this.style.top) || 0,
            Number.parseFloat(this.style.width) || 0,
            Number.parseFloat(this.style.height) || 0,
          );
        }

        const sized = this.classList.contains("dv-groupview")
          ? [900, 600]
          : [1440, 900];

        return new DOMRect(0, 0, sized[0], sized[1]);
      });
    const engine = createDockEngine({ ...createBase(), container });

    engine.floatPanel("fx-analytics");
    engine.floatPanel("fx-blotter");

    const boxes = [
      ...container.querySelectorAll<HTMLElement>(".dv-resize-container"),
    ].map((box) => {
      return [box.style.left, box.style.top, box.style.width, box.style.height];
    });

    expect(boxes).toEqual([
      ["360px", "225px", "720px", "450px"],
      ["388px", "253px", "720px", "450px"],
    ]);
    rects.mockRestore();
    engine.dispose();
  });

  describe("moving a float by its head", () => {
    it("forwards a plain press on the head to the float's move handle, exactly once", () => {
      const container = sizedContainer(1440, 900);
      const engine = createDockEngine(probeHeads(container));
      const { head, pressesOnVoid } = floatedHead(
        container,
        engine,
        "fx-analytics",
      );

      pressOn(head.querySelector(".probe-title") as Element);

      expect(pressesOnVoid()).toBe(1);
      engine.dispose();
    });

    it("leaves a press on a head control to the control", () => {
      const container = sizedContainer(1440, 900);
      const engine = createDockEngine(probeHeads(container));
      const { head, pressesOnVoid } = floatedHead(
        container,
        engine,
        "fx-analytics",
      );

      pressOn(head.querySelector(".probe-control") as Element);

      expect(pressesOnVoid()).toBe(0);
      engine.dispose();
    });

    it("leaves a shift-press to dockview's redock gesture", () => {
      const container = sizedContainer(1440, 900);
      const engine = createDockEngine(probeHeads(container));
      const { head, pressesOnVoid } = floatedHead(
        container,
        engine,
        "fx-analytics",
      );

      pressOn(head.querySelector(".probe-title") as Element, {
        shiftKey: true,
      });

      expect(pressesOnVoid()).toBe(0);
      engine.dispose();
    });

    it("never touches a head that is in the grid", () => {
      const container = sizedContainer(1440, 900);
      const engine = createDockEngine(probeHeads(container));
      const title = container.querySelector('[data-probe-panel="fx-blotter"]');
      const handle = title
        ?.closest(".dv-tabs-and-actions-container")
        ?.querySelector(".dv-void-container");

      if (
        title === null ||
        title === undefined ||
        handle === null ||
        handle === undefined
      ) {
        throw new Error("no grid head for fx-blotter");
      }

      let presses = 0;

      handle.addEventListener("pointerdown", () => {
        presses += 1;
      });
      pressOn(title);

      expect(presses).toBe(0);
      engine.dispose();
    });

    /** Floats `panelId` and returns its group's head bar plus a live count
     * of presses that reached its void container (dockview's move target). */
    function floatedHead(
      container: HTMLElement,
      engine: ReturnType<typeof createDockEngine>,
      panelId: string,
    ): FloatedHead {
      engine.floatPanel(panelId);

      const group = container
        .querySelector(`.dv-resize-container [data-probe-panel="${panelId}"]`)
        ?.closest(".dv-groupview");
      const head = group?.querySelector(".dv-tabs-and-actions-container");
      const handle = head?.querySelector(".dv-void-container");

      if (
        head === undefined ||
        head === null ||
        handle === undefined ||
        handle === null
      ) {
        throw new Error(`no floating head for ${panelId}`);
      }

      let presses = 0;

      handle.addEventListener("pointerdown", () => {
        presses += 1;
      });

      return {
        head,
        pressesOnVoid: () => {
          return presses;
        },
      };
    }

    function pressOn(target: Element, init: PointerEventInit = {}): void {
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 7,
          clientX: 300,
          clientY: 200,
          ...init,
        }),
      );
    }

    /** Engine options whose head mount paints a plain title span and one
     * head button, tagged so the tests can find a given panel's head. */
    function probeHeads(container: HTMLElement): DockEngineOptions {
      const base = createBase();

      return {
        ...base,
        container,
        panels: {
          ...base.panels,
          mountTab: (panelId: string, element: HTMLElement) => {
            const title = document.createElement("span");
            title.dataset.probePanel = panelId;
            title.className = "probe-title";
            const control = document.createElement("button");
            control.className = "probe-control";
            element.append(title, control);

            return () => {
              element.replaceChildren();
            };
          },
        },
      };
    }
  });

  // Dock-home puts back the panel's pre-float EXTENT, not only its slot.
  //
  // Every witness here is BOOKKEEPING or a CALL, never a size read back: the
  // real geometry claim belongs to the layout e2e, where a browser lays the
  // grid out. Two observation points carry the whole contract: the saved
  // blob's `rtcFloatSizes` sidecar (what was remembered, and forgotten), and
  // the `setSize` calls the floated panel's group receives as it docks home
  // (what was put back). FX_LIKE's column holds fx-rates over fx-blotter at
  // 0.6/0.4, so the blotter's pre-float height is ~360 and a dock-home move
  // alone would halve fx-rates' group for it — a different number.
  describe("dock-home restores the pre-float size", () => {
    // Observable at the first save after the float: the sidecar holds the
    // blotter's extent as it stood BEFORE the float, on the height axis (its
    // parent split is a column). The control read proves the capture point:
    // after the float the same group reports a different height, so a
    // capture taken from the settled (post-detach) state would fail here.
    it("remembers the pre-float extent when the head control floats a panel", () => {
      const opts = { ...createBase(), container: sizedContainer(1440, 900) };
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });
      const before = heightOf("fx-blotter");

      expect(engine.floatPanel("fx-blotter")).toBe(true);
      expect(heightOf("fx-blotter")).not.toBe(before);

      touchContainer(opts.container);
      engine.dispose();

      expect(floatSizesIn(seen.blob())).toEqual({
        "fx-blotter": { axis: "height", size: before },
      });
    });

    // The same observation point, through dockview's own gesture — it floats
    // the group inside `addFloatingGroup` and never reaches `floatPanel`, the
    // divergence #763's final review found. Location asserted first, so an
    // absent entry cannot mean "the gesture never floated anything".
    it("remembers the pre-float extent when shift-drag floats a panel", () => {
      const opts = { ...createBase(), container: sizedContainer(1440, 900) };
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });
      const before = heightOf("fx-blotter");

      shiftPointerDown(voidContainerOf("fx-blotter"));

      expect(locationOf("fx-blotter")).toBe("floating");

      touchContainer(opts.container);
      engine.dispose();

      expect(floatSizesIn(seen.blob())).toEqual({
        "fx-blotter": { axis: "height", size: before },
      });
    });

    // Observable the moment `dockPanel` returns (the settle runs on
    // dockview's synchronous `onDidMutateLayout`): the docked group was sized
    // to the remembered height. Then again at the next save: the entry is
    // forgotten, so the blob carries no sidecar at all.
    it("re-applies the remembered extent when the head control docks home, then forgets it", () => {
      const opts = { ...createBase(), container: sizedContainer(1440, 900) };
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });
      const before = heightOf("fx-blotter");

      engine.floatPanel("fx-blotter");
      const sizes = recordSetSize("fx-blotter");
      engine.dockPanel("fx-blotter");

      expect(locationOf("fx-blotter")).toBe("grid");
      expect(sizes()).toContainEqual({ height: before });

      touchContainer(opts.container);
      engine.dispose();

      expect(JSON.parse(seen.blob()).rtcFloatSizes).toBeUndefined();
    });

    // Dockview's own move — what a drag of the float onto the grid calls
    // (`moveGroupOrPanel`, reached here through `panel.api.moveTo` without
    // the DnD plumbing jsdom cannot drive) — never reaches `dockPanel`.
    // Observable immediately on the move, as above.
    it("re-applies the remembered extent when dockview itself moves the float home", () => {
      const engine = createDockEngine({
        ...createBase(),
        container: sizedContainer(1440, 900),
      });
      const before = heightOf("fx-blotter");

      engine.floatPanel("fx-blotter");
      const sizes = recordSetSize("fx-blotter");
      const api = lastDockviewApi();
      const rates = api.getPanel("fx-rates");

      if (rates === undefined) {
        throw new Error("fx-rates is not in the dock");
      }

      api.getPanel("fx-blotter")?.api.moveTo({
        group: rates.group,
        position: "bottom",
      });

      expect(locationOf("fx-blotter")).toBe("grid");
      expect(sizes()).toContainEqual({ height: before });
      engine.dispose();
    });

    // A drop on a group's CENTRE docks the float as a TAB of that group —
    // not a return home. In a column of three the column survives the
    // blotter leaving (rates and positions still stack), so the landing
    // group sits in a split dividing the same axis the entry was taken on,
    // and only the tab-join rule keeps it from being resized to the
    // blotter's old height. Observable on the landing group's own sizing
    // calls the moment the move returns, and at the next save: the entry is
    // forgotten, not held for a later home-coming.
    it("does not resize the group a float joins as a tab", () => {
      const opts = {
        ...createBase(),
        container: sizedContainer(1440, 900),
        seed: COLUMN_OF_THREE,
      };
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });

      engine.floatPanel("fx-blotter");

      const api = lastDockviewApi();
      const rates = api.getPanel("fx-rates");

      if (rates === undefined) {
        throw new Error("fx-rates is not in the dock");
      }

      const sizes = recordSetSize("fx-rates");

      api.getPanel("fx-blotter")?.api.moveTo({
        group: rates.group,
        position: "center",
      });

      expect(locationOf("fx-blotter")).toBe("grid");
      expect(rates.group.panels.length).toBe(2);
      expect(sizes()).toEqual([]);

      touchContainer(opts.container);
      engine.dispose();

      expect(JSON.parse(seen.blob()).rtcFloatSizes).toBeUndefined();
    });

    // Drag-home still works under a live maximize (only the head control is
    // hidden), and re-applying there would shrink the MAXIMIZED panel. The
    // restore is deferred, not dropped. Observable at two points: when the
    // move returns under the maximize, the docked group has been sized to
    // nothing; when `exitMaximize` returns, it has been sized to the
    // remembered height.
    it("defers the restore under a live maximize and applies it on exit", () => {
      const engine = createDockEngine({
        ...createBase(),
        container: sizedContainer(1440, 900),
      });
      const before = heightOf("fx-blotter");

      engine.floatPanel("fx-blotter");
      engine.maximizePanel("fx-rates");

      const sizes = recordSetSize("fx-blotter");
      const api = lastDockviewApi();
      const rates = api.getPanel("fx-rates");

      if (rates === undefined) {
        throw new Error("fx-rates is not in the dock");
      }

      api.getPanel("fx-blotter")?.api.moveTo({
        group: rates.group,
        position: "bottom",
      });

      expect(locationOf("fx-blotter")).toBe("grid");
      expect(sizes()).not.toContainEqual({ height: before });

      engine.exitMaximize();

      expect(sizes()).toContainEqual({ height: before });
      engine.dispose();
    });

    // Both sides of the reload in one test: the write (the sidecar the first
    // engine saved) and the read (a SECOND engine, built from that blob,
    // re-applying it at dock-home). Observable only at the second engine's
    // dock-home — the reload itself resizes nothing, the float is still out.
    it("survives a reload: the sidecar round-trips through construction", () => {
      const opts = { ...createBase(), container: sizedContainer(1440, 900) };
      const seen = trackLayout();
      const first = createDockEngine({ ...opts, ...seen.options });
      const before = heightOf("fx-blotter");

      first.floatPanel("fx-blotter");
      touchContainer(opts.container);
      first.dispose();

      const reloaded = createDockEngine({
        ...createBase(),
        container: sizedContainer(1440, 900),
        blob: seen.blob(),
      });

      expect(locationOf("fx-blotter")).toBe("floating");

      const sizes = recordSetSize("fx-blotter");
      reloaded.dockPanel("fx-blotter");

      expect(sizes()).toContainEqual({ height: before });
      reloaded.dispose();
    });

    // The load-time filter, observed at the reloaded engine's first save: a
    // well-formed entry for the panel that really came back floating is kept
    // (the control — so a missing entry cannot mean "the sidecar was never
    // read"), while a well-formed entry for a panel that came back DOCKED is
    // stale and dropped, as is one for a panel that is not in the dock.
    it("keeps the entry of a restored float and drops stale ones on load", () => {
      const blob = createBlobWithFloatSizes({
        "fx-blotter": { axis: "height", size: 360 },
        "fx-rates": { axis: "height", size: 500 },
        ghost: { axis: "width", size: 300 },
      });
      const container = sizedContainer(1440, 900);
      const seen = trackLayout();
      const engine = createDockEngine({
        ...createBase(),
        container,
        ...seen.options,
        blob,
      });

      touchContainer(container);
      engine.dispose();

      expect(floatSizesIn(seen.blob())).toEqual({
        "fx-blotter": { axis: "height", size: 360 },
      });
    });

    // Malformed entries for the one panel that DID come back floating, so
    // nothing but the entry's own shape can be what drops it. Observed at the
    // reloaded engine's first save: no sidecar at all. The float itself is
    // asserted first, so "no sidecar" cannot mean "no float to key it by".
    it.each([
      ["a non-numeric size", { axis: "height", size: "tall" }],
      ["a non-positive size", { axis: "height", size: -5 }],
      ["an unknown axis", { axis: "depth", size: 360 }],
      ["a null entry", null],
    ])("drops an entry with %s on load", (_label, entry) => {
      const blob = createBlobWithFloatSizes({ "fx-blotter": entry });
      const container = sizedContainer(1440, 900);
      const seen = trackLayout();
      const engine = createDockEngine({
        ...createBase(),
        container,
        ...seen.options,
        blob,
      });

      expect(locationOf("fx-blotter")).toBe("floating");

      touchContainer(container);
      engine.dispose();

      expect(JSON.parse(seen.blob()).rtcFloatSizes).toBeUndefined();
    });

    // A grid that changed while the panel floated. Observable at dock-home:
    // the size asked for is what the column can give — its whole height less
    // fx-rates' minimum — not the remembered 5000 (a container that shrank
    // since, reduced to its limit).
    it("clamps a remembered extent that no longer fits to what the split can give", () => {
      const blob = createBlobWithFloatSizes({
        "fx-blotter": { axis: "height", size: 5000 },
      });

      const engine = createDockEngine({
        ...createBase(),
        container: sizedContainer(1440, 900),
        blob,
      });
      const sizes = recordSetSize("fx-blotter");

      engine.dockPanel("fx-blotter");

      const rates = lastDockviewApi().getPanel("fx-rates");

      if (rates === undefined) {
        throw new Error("fx-rates is not in the dock");
      }

      const column = heightOf("fx-rates") + heightOf("fx-blotter");

      expect(sizes()).toEqual([{ height: column - rates.group.minimumHeight }]);
      engine.dispose();
    });

    // Exclusion 1, observed at the save after floating: a design-pin member
    // gets no entry (its pin re-clamp restores its designed size on
    // dock-home). The blotter, floated alongside, is the control.
    it("remembers nothing for a pinned panel (its pin restores it)", () => {
      const opts = createPinnedRailBase();
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });

      engine.floatPanel("fx-analytics");
      engine.floatPanel("fx-blotter");

      expect(locationOf("fx-analytics")).toBe("floating");

      touchContainer(opts.container);
      engine.dispose();

      expect(Object.keys(floatSizesIn(seen.blob()))).toEqual(["fx-blotter"]);
    });

    // Exclusion 2, same observation point: a chart instance gets no entry
    // (on dock-home the equal-share rule decides its width). The blotter is
    // again the control.
    it("remembers nothing for a chart instance (the share rule sizes it)", () => {
      const container = sizedContainer(1440, 900);
      const seen = trackLayout();
      const engine = createDockEngine({
        ...createBase(),
        container,
        ...seen.options,
        dynamicPanels: [
          { id: "i-aapl", initialPx: 360, unpinned: true },
          { id: "i-msft", initialPx: 360, unpinned: true },
        ],
      });

      engine.floatPanel("i-aapl");
      engine.floatPanel("fx-blotter");

      expect(locationOf("i-aapl")).toBe("floating");

      touchContainer(container);
      engine.dispose();

      expect(Object.keys(floatSizesIn(seen.blob()))).toEqual(["fx-blotter"]);
    });

    function heightOf(panelId: string): number {
      const panel = lastDockviewApi().getPanel(panelId);

      if (panel === undefined) {
        throw new Error(`${panelId} is not in the dock`);
      }

      return panel.group.api.height;
    }

    /** The saved blob's `rtcFloatSizes` sidecar — throws when absent, so an
     * assertion on its content can never pass on a blob that has none. */
    function floatSizesIn(blob: string): Record<string, unknown> {
      const sidecar = JSON.parse(blob).rtcFloatSizes;

      if (sidecar === undefined) {
        throw new Error("the saved blob carries no rtcFloatSizes sidecar");
      }

      return sidecar;
    }

    /** Every `setSize` argument `panelId`'s CURRENT group receives from here
     * on — a pass-through spy, so dockview still resizes. dockview reuses the
     * floated group instance on the way home (measured in the dockPanel
     * suite above), so the spy set on the float sees the dock-home call. */
    function recordSetSize(panelId: string): () => readonly unknown[] {
      const panel = lastDockviewApi().getPanel(panelId);

      if (panel === undefined) {
        throw new Error(`${panelId} is not in the dock`);
      }

      const spy = vi.spyOn(panel.group.api, "setSize");

      return (): readonly unknown[] => {
        return spy.mock.calls.map(([event]) => {
          return event;
        });
      };
    }

    /** A blob with fx-blotter floated, its sidecar replaced by `sidecar` —
     * the hand-edited or stale shapes a load must survive. */
    function createBlobWithFloatSizes(
      sidecar: Record<string, unknown>,
    ): string {
      const opts = { ...createBase(), container: sizedContainer(1440, 900) };
      const seen = trackLayout();
      const engine = createDockEngine({ ...opts, ...seen.options });

      engine.floatPanel("fx-blotter");
      touchContainer(opts.container);
      engine.dispose();

      return JSON.stringify({
        ...JSON.parse(seen.blob()),
        rtcFloatSizes: sidecar,
      });
    }
  });

  function locationOf(panelId: string): string {
    const panel = lastDockviewApi().getPanel(panelId);

    if (panel === undefined) {
      throw new Error(`${panelId} is not in the dock`);
    }

    return panel.group.api.location.type;
  }

  function isWidthClamped(panelId: string): boolean {
    const [minimum, maximum] = widthClampOf(panelId);

    return minimum === maximum;
  }

  /** The group element of `panelId`'s own tab-bar void container — the
   * element dockview's shift-drag-to-float gesture listens on. */
  function voidContainerOf(panelId: string): Element {
    const panel = lastDockviewApi().getPanel(panelId);
    const voidContainer =
      panel?.group.element.querySelector(".dv-void-container");

    if (voidContainer === null || voidContainer === undefined) {
      throw new Error(`no void container for ${panelId}`);
    }

    return voidContainer;
  }

  /** dockview starts the float gesture from a shift-pointerdown; jsdom has
   * no PointerEvent constructor here, and a MouseEvent carries exactly the
   * fields the gesture reads (`shiftKey`, `defaultPrevented`) — a real
   * browser's PointerEvent IS a MouseEvent.
   *
   * `cancelable` is the load-bearing option, not boilerplate: a real
   * pointerdown is cancelable, and on a synthetic event that defaults to
   * FALSE, where `preventDefault()` is silently a no-op and
   * `defaultPrevented` never flips — the veto would look broken for a reason
   * that exists only in the test. */
  function shiftPointerDown(target: Element): MouseEvent {
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    target.dispatchEvent(event);

    return event;
  }

  /** A blob holding a pinned rail with `fx-analytics` floated — the state a
   * reload restores, and the only way to reach a pin record that was
   * suspended before any grid split existed to name. */
  function createBlobWithFloatedRail(): string {
    const opts = createPinnedRailBase();
    const seen = trackLayout();
    const engine = createDockEngine({ ...opts, ...seen.options });

    engine.floatPanel("fx-analytics");
    touchContainer(opts.container);
    engine.dispose();

    return seen.blob();
  }

  /** Drags the sash inside ONE named split, rather than the first match of a
   * selector: `dragSash(container, ".dv-vertical")` picks whichever column
   * comes first in the DOM, which is not the one a test about a specific
   * column means. Same three events as `dragSash`. */
  function dragSashIn(split: Element | null): void {
    const sash = split?.querySelector(":scope > .dv-sash-container > .dv-sash");

    if (sash === null || sash === undefined) {
      throw new Error("no sash under the named split");
    }

    sash.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    window.dispatchEvent(new Event("pointermove"));
    window.dispatchEvent(new Event("pointerup"));
  }

  /** Each panel's group width on the last engine, in `panelIds` order —
   * dockview's split-model widths, which a sized jsdom container does give. */
  function groupWidthsOf(panelIds: readonly string[]): readonly number[] {
    return panelIds.map((panelId) => {
      const panel = lastDockviewApi().getPanel(panelId);

      if (panel === undefined) {
        throw new Error(`${panelId} is not in the dock`);
      }

      return panel.group.api.width;
    });
  }

  /** An engine holding two chart instances, with the container handle a
   * settled resize needs. */
  interface InstancesFixture {
    readonly engine: DockEngine;
    readonly container: HTMLElement;
  }

  /** Instances + the container they live in, for the two R6 tests: the pair
   * differs ONLY in whether the float docks home before the resize. */
  function createEngineWithInstances(): InstancesFixture {
    const container = sizedContainer(1440, 900);

    return {
      container,
      engine: createDockEngine({
        ...createBase(),
        container,
        dynamicPanels: [
          { id: "i-aapl", initialPx: 360, unpinned: true },
          { id: "i-msft", initialPx: 360, unpinned: true },
        ],
      }),
    };
  }
});

describe("floats persist across a reload, and a damaged float costs only the floats", () => {
  it("restores a saved float on reload (tier: blob)", () => {
    const container = sizedContainer(1440, 900);
    let saved = "";
    const first = createDockEngine({
      ...createBase(),
      container,
      onLayoutChange: (blob: string): void => {
        saved = blob;
      },
    });
    first.floatPanel("fx-analytics");
    touchContainer(container); // #737: dispose flushes only an arranged dock
    first.dispose();
    expect(saved).not.toBe("");

    const second = createDockEngine({
      ...createBase(),
      container,
      blob: saved,
    });

    expect(
      lastDockviewApi().getPanel("fx-analytics")?.group.api.location.type,
    ).toBe("floating");
    second.dispose();
  });

  // MEASURED (2026-09-16), not assumed: dropping `floatingGroups` outright —
  // what `withoutFloatingGroups` does — is NOT a re-parent, unlike
  // `withoutPopoutGroups`. dockview's own `fromJSON` never instantiates a
  // `panels` entry that no grid/floating/popout structure references, so
  // the floated panel itself does not come back at this tier — that IS the
  // cost this design accepts ("a damaged float costs the user only their
  // floats", not their whole layout). What THIS test proves is the other
  // half of that promise: the DOCKED remainder is untouched by the
  // corruption, not reset to a fresh seed shape. A plain "the other panels
  // are still present somewhere" check can't tell a genuine partial
  // restore from an accidental full seed-fallback bug — FX_LIKE's fresh
  // conversion always puts rates and blotter in SEPARATE groups — so, the
  // same technique the dynamic-node-scrub tests use above, blotter is
  // stacked into rates' own group BEFORE the float: a shape only a real
  // restore can reproduce.
  it("a damaged float costs only the float — the docked remainder survives untouched (tier: blob-without-floats)", () => {
    const container = sizedContainer(1440, 900);
    let saved = "";
    const first = createDockEngine({
      ...createBase(),
      container,
      onLayoutChange: (blob: string): void => {
        saved = blob;
      },
    });
    const api = lastDockviewApi();
    const rates = api.getPanel("fx-rates");
    const blotter = api.getPanel("fx-blotter");

    if (!rates || !blotter) {
      throw new Error("fixture panels missing");
    }

    blotter.api.moveTo({ group: rates.group, position: "center" });
    expect(rates.group.panels.length).toBe(2);

    first.floatPanel("fx-analytics");
    touchContainer(container);
    first.dispose();

    // A malformed floating-group entry — the exact shape dockview's own
    // fromJSON throws on (measured: "group id must be of type string").
    const broken = JSON.stringify({
      ...JSON.parse(saved),
      floatingGroups: [{ data: { nope: true } }],
    });

    const engine = createDockEngine({
      ...createBase(),
      container,
      blob: broken,
    });
    const reloaded = lastDockviewApi();

    // The float itself is gone — the cost this tier accepts.
    expect(reloaded.getPanel("fx-analytics")).toBeUndefined();
    // ...but the docked stack survived EXACTLY as arranged, not reseeded:
    // a seed fallback could never reproduce rates+blotter sharing one group.
    expect(
      reloaded.getPanel("fx-rates")?.group.panels.map((panel) => {
        return panel.id;
      }),
    ).toEqual(["fx-rates", "fx-blotter"]);
    expect(engine.groupCount()).toBe(1);
    engine.dispose();
  });
});

// Controller ruling: the tier LABEL itself must be a provable assertion, not
// only the layout it produces — a mislabelled tier (e.g. the "blob" and
// "blob-without-floats" branches swapped, or a branch returning the wrong
// literal) could still leave the resulting layout looking right by
// coincidence, since the fixtures above never read `restoreTier` at all.
// `loadBlobOrSeed` is exported (and `RestoreTier` with it) for exactly this:
// each test below reads `restoreTier` straight off the real production
// function's return value — a real consumer, not a private read — so
// mislabelling ANY rung of the ladder fails the corresponding `toBe` here,
// independent of whatever layout that rung happens to produce.
describe("loadBlobOrSeed's restoreTier (the provable tier label)", () => {
  it("tier: blob — a healthy blob restores as-is, floats included", () => {
    const container = sizedContainer(1440, 900);
    let saved = "";
    const first = createDockEngine({
      ...createBase(),
      container,
      onLayoutChange: (blob: string): void => {
        saved = blob;
      },
    });
    first.floatPanel("fx-analytics");
    touchContainer(container);
    first.dispose();

    const api = createFreshDockviewApi(1440, 900);
    const restoreTier: RestoreTier = loadBlobOrSeed(
      api,
      { ...createBase(), blob: saved },
      1440,
      900,
    ).restoreTier;

    expect(restoreTier).toBe("blob");
    api.dispose();
  });

  it("tier: blob-without-floats — a malformed floatingGroups entry alone is scrubbed", () => {
    const container = sizedContainer(1440, 900);
    let saved = "";
    const first = createDockEngine({
      ...createBase(),
      container,
      onLayoutChange: (blob: string): void => {
        saved = blob;
      },
    });
    first.floatPanel("fx-analytics");
    touchContainer(container);
    first.dispose();

    const broken = JSON.stringify({
      ...JSON.parse(saved),
      floatingGroups: [{ data: { nope: true } }],
    });

    const api = createFreshDockviewApi(1440, 900);
    const restoreTier: RestoreTier = loadBlobOrSeed(
      api,
      { ...createBase(), blob: broken },
      1440,
      900,
    ).restoreTier;

    expect(restoreTier).toBe("blob-without-floats");
    api.dispose();
  });

  it("tier: blob-without-dynamic — a malformed dynamic leaf alone is scrubbed", async () => {
    const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;
    const seen = trackLayout();
    const first = createDockEngine({
      ...createBase(),
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);
    first.dispose();

    const parsed = JSON.parse(seen.blob());
    const dynLeaf = leafHolding(parsed.grid.root, "panel-dyn-1");

    if (dynLeaf === null) {
      throw new Error("panel-dyn-1's leaf missing from the captured blob");
    }

    // Corrupt the GROUP id itself, not merely its `panels` entry: measured,
    // dockview tolerates a view with no `panels` entry at all by degrading
    // it to an undefined panel rather than throwing (reconciliation then
    // silently re-adds it via the normal insertDynamicPanel path either
    // way — no genuine retry required). A non-string group id is the shape
    // that reliably throws ("group id must be of type string"), so the
    // full attempt fails for real and the retry ladder actually runs.
    dynLeaf.data.id = 42;

    const api = createFreshDockviewApi(1440, 900);
    const restoreTier: RestoreTier = loadBlobOrSeed(
      api,
      { ...createBase(), blob: JSON.stringify(parsed), dynamicPanels: [DYN] },
      1440,
      900,
    ).restoreTier;

    expect(restoreTier).toBe("blob-without-dynamic");
    api.dispose();
  });

  // THE CUMULATIVE-LADDER PIN (fix round 1): a blob damaged in BOTH ways at
  // once — an unrestorable float AND an unrestorable dynamic leaf — must
  // still cost only those two things, never the whole desk. A
  // non-cumulative ladder (rung 3 re-scrubbing the ORIGINAL blob, which
  // still carries the broken `floatingGroups`) throws again on rung 3 and
  // falls all the way through to `"seed"`, reseeding the user's entire
  // arrangement over a float that was never rung 3's problem to fix — the
  // exact defect this test exists to catch. A cumulative ladder reaches
  // `"blob-without-dynamic"` instead, because rung 3 retries on the
  // FLOATS-ALREADY-DROPPED blob, not the original.
  //
  // Per Controller Ruling: a doubly-scrubbed restore reports the LAST and
  // most severe tier reached, `"blob-without-dynamic"` — not a fourth
  // combined label — because the ladder is ordered and reaching rung 3
  // already implies rung 2 ran too (see {@link RestoreTier}'s doc comment).
  //
  // A single-damage test at either rung cannot distinguish a cumulative
  // ladder from a non-cumulative one — they produce IDENTICAL blobs and
  // IDENTICAL tiers when only one thing is broken. The difference is
  // observable only here: the tier label AND the surviving group set of a
  // restore damaged in both ways at once.
  it("tier: blob-without-dynamic — a float AND a dynamic leaf damaged together still costs only those two (the cumulative-ladder pin)", async () => {
    const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;
    const container = sizedContainer(1440, 900);
    const seen = trackLayout();
    const first = createDockEngine({
      ...createBase(),
      container,
      ...seen.options,
      dynamicPanels: [DYN],
    });
    await waitForSize(seen, "panel-dyn-1", 360);

    const api = lastDockviewApi();
    const rates = api.getPanel("fx-rates");
    const blotter = api.getPanel("fx-blotter");

    if (!rates || !blotter) {
      throw new Error("fixture panels missing");
    }

    // Same non-seed-reproducible witness as the engine-level float test
    // above: a fresh seed conversion could never reproduce rates and
    // blotter sharing one group.
    blotter.api.moveTo({ group: rates.group, position: "center" });
    expect(rates.group.panels.length).toBe(2);

    first.floatPanel("fx-analytics");
    touchContainer(container);
    first.dispose();

    const parsed = JSON.parse(seen.blob());
    const dynLeaf = leafHolding(parsed.grid.root, "panel-dyn-1");

    if (dynLeaf === null) {
      throw new Error("panel-dyn-1's leaf missing from the captured blob");
    }

    // Damage BOTH independently — the same two corruptions the single-
    // damage tests above use in isolation — in the SAME blob.
    dynLeaf.data.id = 42;
    const bothDamaged = JSON.stringify({
      ...parsed,
      floatingGroups: [{ data: { nope: true } }],
    });

    const freshApi = createFreshDockviewApi(1440, 900);
    const restored = loadBlobOrSeed(
      freshApi,
      { ...createBase(), blob: bothDamaged, dynamicPanels: [DYN] },
      1440,
      900,
    );

    expect(restored.restoreTier).toBe("blob-without-dynamic");
    expect(
      freshApi.getPanel("fx-rates")?.group.panels.map((panel) => {
        return panel.id;
      }),
    ).toEqual(["fx-rates", "fx-blotter"]);
    freshApi.dispose();
  });

  it("tier: seed — nothing of the blob is usable", () => {
    const api = createFreshDockviewApi(1440, 900);
    const restoreTier: RestoreTier = loadBlobOrSeed(
      api,
      { ...createBase(), blob: "{not json" },
      1440,
      900,
    ).restoreTier;

    expect(restoreTier).toBe("seed");
    api.dispose();
  });

  function createFreshDockviewApi(width: number, height: number): DockviewApi {
    const api = createDockview(sizedContainer(width, height), {
      createComponent: () => {
        return { element: document.createElement("div"), init: () => {} };
      },
      theme: { name: "t", className: "t" },
    });
    api.layout(width, height);

    return api;
  }
});

/** Walks a parsed blob's grid for the leaf whose `views` names `panelId`,
 * loosely — a test-only mirror of {@link removeDynamicViews}'s own walk,
 * used to hand-corrupt exactly one leaf's group id without disturbing the
 * rest of a real captured blob. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function leafHolding(node: any, panelId: string): any {
  if (node.type === "leaf") {
    return node.data.views.includes(panelId) ? node : null;
  }

  for (const child of node.data) {
    const found = leafHolding(child, panelId);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

/** Re-reports `container` at a new size and delivers it to the engine's own
 * ResizeObserver — the settle path. A narrower twin of the "settle resize"
 * suite's own `settleTo`, without its dockview-first ordering knob, which the
 * instance re-share does not depend on. */
function resizeContainerTo(
  container: HTMLElement,
  width: number,
  height: number,
): void {
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    get: () => {
      return width;
    },
  });
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => {
      return height;
    },
  });

  for (const observer of [...recordedObservers]) {
    if (observer.targets.includes(container)) {
      const entry = {
        target: container,
        contentRect: { width, height },
      } as unknown as ResizeObserverEntry;
      observer.callback([entry], observer as unknown as ResizeObserver);
    }
  }
}

/** The names of the sizing calls a group's api has received, in order. */
interface SizingCensus {
  calls: () => readonly string[];
}

/** Records every call the engine makes to `panelId`'s group sizing api — the
 * two methods `axisOf` drives (`setConstraints`, `setSize`). A census, not a
 * geometry reading: the sharing rule constrains and then releases, so its
 * effect on a member leaves no readable state behind, only these calls. */
function spyOnGroupSizing(panelId: string): SizingCensus {
  const panel = lastDockviewApi().getPanel(panelId);

  if (panel === undefined) {
    throw new Error(`${panelId} is not in the dock`);
  }

  const seen: string[] = [];
  const groupApi = panel.group.api;

  function recordCall(name: string): () => void {
    return () => {
      seen.push(name);
    };
  }

  vi.spyOn(groupApi, "setConstraints").mockImplementation(
    recordCall("setConstraints"),
  );
  vi.spyOn(groupApi, "setSize").mockImplementation(recordCall("setSize"));

  return {
    calls: (): readonly string[] => {
      return seen;
    },
  };
}

function lastDockviewApi(): DockviewApi {
  if (capturedDockview.api === null) {
    throw new Error("no dockview created yet");
  }

  return capturedDockview.api as DockviewApi;
}

/** `[minimumWidth, maximumWidth]` of `panelId`'s group on the last engine —
 * a design pin reads as both equal to its model width (card + gap). jsdom
 * lays nothing out, so constraints are the witness, not rendered pixels. */
function widthClampOf(panelId: string): readonly [number, number] {
  const panel = lastDockviewApi().getPanel(panelId);

  if (panel === undefined) {
    throw new Error(`${panelId} is not in the dock`);
  }

  return [panel.group.minimumWidth, panel.group.maximumWidth];
}

/** Polls the persisted layout until its `rtcDesignPins` sidecar holds
 * exactly `expected` pins — the pin analogue of {@link waitForSize}. */
/** Polls until at least one serialisation landed — the debounce is 0 in
 * tests, but the save still rides a macrotask. */
async function waitForSaves(tracker: LayoutTracker): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (tracker.saves > 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  throw new Error("no save ever landed");
}

async function waitForPins(
  tracker: LayoutTracker,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (tracker.saves > 0 && tracker.pins().length === expected) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(
    `pins never reached ${expected} (last seen: ${tracker.pins().length}, saves: ${tracker.saves})`,
  );
}

function trackLayout(): LayoutTracker {
  let blob = "";

  function savedBlob(): string {
    if (blob === "") {
      throw new Error(
        "no layout was saved — did the engine get a pointer before dispose? (see persistArranged)",
      );
    }

    return blob;
  }

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
    // These two THROW rather than returning [] / "" when nothing was saved: an
    // empty read is indistinguishable from "saved, and empty", so a test
    // asserting `pins()).toEqual([])` or two equal blobs would pass with no
    // save at all. That became reachable once dispose stopped flushing
    // untouched engines. (sizeOf stays nullable: waitForSize polls it before
    // the first save, and a null already fails any size assertion loudly.)
    pins: (): readonly unknown[] => {
      return JSON.parse(savedBlob()).rtcDesignPins ?? [];
    },
    blob: (): string => {
      return savedBlob();
    },
  };

  return tracker;
}

/** The visible (card) size of the branch that directly holds `panelId`'s
 * leaf, on the axis of ITS parent — the model minus one gap, like
 * findLeafSize. Null for a leaf sitting directly under the root. */
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

    for (const child of parent.data) {
      if (child.type === "branch" && child.data.some(holdsLeaf)) {
        return child.size - GROUP_GAP_PX;
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

/** The visible (card) size of `panelId`'s group, read back out of the
 * persisted blob. The blob carries MODEL sizes (with no theme gap, dockview
 * serialises exactly what it renders), and the gap-0 model is card + one
 * gap — a leaf view's CSS inset — so this subtracts the constant, whatever
 * the sibling count. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function findLeafSize(node: any, panelId: string): number | null {
  if (node.type === "leaf") {
    return null;
  }

  const children: unknown[] = node.data ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  for (const child of children as any[]) {
    if (child.type === "leaf" && child.data?.views?.includes(panelId)) {
      return child.size - GROUP_GAP_PX;
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
function createTwoTabGroupLayout(): unknown {
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
 * label reads `title` — what `createBase()`'s title hook produced for the panel. */
/** Resolves once the pending animation frame has run — dockview 8 schedules
 * pointer-driven tab activation on one. */
function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/** Resolves after one macrotask — "one call apart", as a user's second click
 * would be, so no same-tick state carries between two engine calls. */
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

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

/** {@link createBase} over RAIL_LIKE, with the FX rail panels' real
 * `maximizeScope: "nearest-column"` supplied through the hook. */
function createRailBase(): DockEngineOptions {
  const opts = createBase();

  return {
    ...opts,
    seed: RAIL_LIKE,
    panels: { ...opts.panels, maximizeScope: railScope },
  };
}

/** RAIL_LIKE with the analytics/positions rail pinned at 360 — its pin reads
 * as `min === max`. Shared by the absorber suite and the float suite. */
function createPinnedRailBase(): DockEngineOptions {
  const opts = createRailBase();

  return { ...opts, seed: { ...RAIL_LIKE, initialPx: [undefined, 360] } };
}

function railScope(panelId: string): DockMaximizeScope {
  return panelId === "fx-analytics" || panelId === "fx-positions"
    ? "nearest-column"
    : "root";
}

/** The `.dv-vertical` split container the panel's view lives in — the
 * "column" identity the reopen anchor rule is asserted with. Located via the
 * mounted content marker (`content:<id>`), which the createBase() hooks render. */
function columnOf(panelId: string): Element | null {
  const marker = [...document.querySelectorAll("*")].find((el) => {
    return el.textContent === `content:${panelId}` && el.children.length === 0;
  });

  return marker?.closest(".dv-vertical") ?? null;
}

function createBase(): DockEngineOptions {
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
 * identically, so the twin lays out exactly as the live engine did. Sizes
 * read back as CARDS (the model minus one gap), a little under the nominal
 * fraction — why the collapse tests capture the baseline rather than
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

/** Every ResizeObserver constructed since the last clear, in order. */
const recordedObservers: RecordingResizeObserver[] = [];

/** The file's ResizeObserver stand-in: inert unless a test delivers a resize
 * by calling an observer's `callback` for a target it is watching. */
class RecordingResizeObserver {
  readonly targets: Element[] = [];

  constructor(readonly callback: ResizeObserverCallback) {
    recordedObservers.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    this.targets.splice(this.targets.indexOf(target), 1);
  }

  disconnect(): void {
    this.targets.splice(0);
  }
}

/** A detached-from-layout container that REPORTS a size, as a real browser
 * container would — jsdom lays nothing out, so clientWidth/clientHeight are
 * otherwise 0 and the engine falls back to 1200x800. */
function sizedContainer(width: number, height: number): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  attachedContainers.push(container);
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    get: () => {
      return width;
    },
  });
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => {
      return height;
    },
  });

  return container;
}

/** Stands in for a user having been inside the dock: dispose only persists a
 * layout a pointer touched (see the engine's dispose). */
function touchContainer(container: HTMLElement): void {
  container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

/** Builds an engine from `opts`, lets a pointer touch it, and disposes it —
 * leaving behind the persisted form of a session a user arranged. The idiom
 * for reading what a construction serialises: dispose no longer flushes an
 * engine nobody touched. */
function persistArranged(opts: DockEngineOptions): void {
  const engine = createDockEngine(opts);
  touchContainer(opts.container);
  engine.dispose();
}

/** The blob a user-arranged engine built from `opts` persists on dispose. */
function userArrangedBlob(opts: DockEngineOptions): string {
  const seen = trackLayout();
  const engine = createDockEngine({ ...opts, ...seen.options });
  touchContainer(opts.container);
  engine.dispose();

  return seen.blob();
}

/** `panelId`'s rendered size on an engine built from `opts`, read from the
 * blob it persists once a pointer has touched it. */
function userFlushedSize(opts: DockEngineOptions, panelId: string): number {
  const seen = trackLayout();
  const engine = createDockEngine({ ...opts, ...seen.options });
  touchContainer(opts.container);
  engine.dispose();

  const size = seen.sizeOf(panelId);

  if (size === null) {
    throw new Error(`${panelId} has no rendered size`);
  }

  return size;
}

function baseline(opts: DockEngineOptions): LayoutTracker {
  const seen = trackLayout();
  const engine = createDockEngine({ ...opts, ...seen.options });
  // dispose flushes one final serialisation synchronously, but only for a
  // layout a pointer touched — see the engine. The twin exists to be read.
  touchContainer(opts.container);
  engine.dispose();

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

// cannot be dispatched here; moveTo IS the engine-visible half of a drop.
/** The dockview create options narrowed to the popout target the engine
 * threads through. */
/** A floated panel's head bar, and how many presses have reached the void
 * container dockview moves the float from. */
interface FloatedHead {
  readonly head: Element;
  readonly pressesOnVoid: () => number;
}

interface PopoutUrlCarrier {
  readonly popoutUrl?: string;
}

// vitest hoists vi.mock/vi.hoisted during transform, so position is free.
vi.mock("dockview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dockview")>();

  return {
    ...actual,
    createDockview: (
      ...args: Parameters<typeof actual.createDockview>
    ): ReturnType<typeof actual.createDockview> => {
      const api = actual.createDockview(...args);
      capturedDockview.api = api;
      capturedDockview.options = args[1];

      return api;
    },
  };
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
/** FX_LIKE's root row once `createEngineWithInstances` opens its two chart
 * instances at the right edge — the members the R6 share rule divides. */
const ROW_WITH_INSTANCES = ["fx-rates", "fx-analytics", "i-aapl", "i-msft"];

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

/** A single-panel seed — the real shape of the Admin tab. With one dynamic
 * panel docked, its root serializes as exactly `[static leaf, dynamic
 * leaf]`: the reproduction for the root-collapse scrub bug (a corrupt
 * dynamic leaf's removal must not turn this root into a bare, dockview-
 * rejected leaf). */
const ADMIN_LIKE = { kind: "panel", panelId: "admin" } as const;

/** FX_LIKE with a THIRD panel in the main column — so the column survives
 * one of its panels floating out, which a two-panel column does not. */
const COLUMN_OF_THREE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.4, 0.3, 0.3],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
        { kind: "panel", panelId: "fx-positions" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

const attachedContainers: HTMLElement[] = [];

const STRIP = 32;
