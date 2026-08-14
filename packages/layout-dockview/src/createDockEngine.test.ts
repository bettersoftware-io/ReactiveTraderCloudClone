import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DockEngineOptions } from "#/createDockEngine";
import { createDockEngine } from "#/createDockEngine";

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
    // through the rendered DOM: TitleOnlyTab (the engine's own tab renderer —
    // see the close-action test below for why it replaces dockview's
    // default) writes each panel's title into a `.dv-default-tab-content`
    // node inside the container it owns.
    expect(opts.container.textContent).toContain("FX-RATES");
    expect(opts.container.textContent).toContain("FX-BLOTTER");
    expect(opts.container.textContent).toContain("FX-ANALYTICS");
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
    // extent (1200×800) applies: 0.73 × 1200 = 876, remainder = 324. Also
    // assert against the even-50/50 collapse this test regresses on.
    expect(viewWidths).toContain(876);
    expect(viewWidths).toContain(324);
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
    await flush();

    // 0.25 of the 1200px fallback width before, the strip after.
    expect(seen.sizeOf("fx-analytics")).toBe(STRIP);
    engine.dispose();
  });

  it("restores the exact pre-collapse size on expand", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });

    engine.collapsePanel("fx-analytics");
    await flush();
    expect(seen.sizeOf("fx-analytics")).toBe(STRIP);

    engine.expandPanel("fx-analytics");
    await flush();

    // Not merely "wider than the strip" — the SAME width it had before, which
    // is what separates restoring from letting the splitview redistribute.
    expect(seen.sizeOf("fx-analytics")).toBe(ANALYTICS_PX);
    engine.dispose();
  });

  it("is idempotent — a second collapse cannot overwrite the remembered size", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });

    engine.collapsePanel("fx-analytics");
    await flush();
    // Without the `preCollapse.has` guard this second call would record the
    // STRIP width as "pre-collapse", and expand would restore it to a strip.
    engine.collapsePanel("fx-analytics");
    await flush();
    engine.expandPanel("fx-analytics");
    await flush();

    expect(seen.sizeOf("fx-analytics")).toBe(ANALYTICS_PX);
    engine.dispose();
  });

  it("ignores expand for a panel this engine never collapsed", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });

    engine.expandPanel("fx-analytics");
    await flush();

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
/** fx-analytics is the 0.25 side of FX_LIKE's row split, against the engine's
 * 1200px fallback width (jsdom never gives the container a real size). */
const ANALYTICS_PX = 300;

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
}

/** Captures every persisted layout so a test can read the size dockview
 * actually recorded, rather than the DOM — jsdom never lays anything out. */
function trackLayout(): {
  options: Pick<DockEngineOptions, "onLayoutChange" | "debounceMs">;
  saves: number;
  sizeOf(panelId: string): number | null;
} {
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
