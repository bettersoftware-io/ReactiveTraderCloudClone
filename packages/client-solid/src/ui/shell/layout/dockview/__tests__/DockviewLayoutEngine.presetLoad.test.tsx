import { batch, createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createDefaultLayoutPort,
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  type PanelId,
} from "@rtc/client-core";
import { createDockEngine, DOCK_BLOB_VERSION } from "@rtc/layout-dockview";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineDockedPage } from "#tests/ui/pages/DockviewLayoutEngineDockedPage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (mirrors the react twin). The stub must be in place before the FIRST
// `createDockEngine` call, which here includes the blob-capturing factories the
// cases call, not only the mounted bridge.
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    (globalThis as unknown as GlobalWithResizeObserver).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    } as unknown as ResizeObserverCtor;
  }
});

afterEach(() => {
  page.unmountAll();
});

/** Phase 6b Task 1 — the MEASUREMENT of the shipped `layoutResets` rebuild as
 * a preset-LOAD path, before any of the phase's code depends on it. The Solid
 * twin of `client-react`'s identically-named spec; see that file's describe doc
 * for what each question is and why none of it is assumed.
 *
 * The one-commit act is a `batch(...)` here rather than a `rerender` — Solid's
 * component bodies run once, so the layer-2 signals and the reset counter are
 * written together inside one batch, which is this framework's analogue of the
 * single React commit and the same shape Task 5's `load` will produce. */
describe("DockviewLayoutEngine preset load (layoutResets rebuild)", () => {
  // The premise every case below rests on — see the react twin.
  it("loads between two engine-written blobs that differ structurally", () => {
    const seedShaped = createEngineWrittenSeedBlob();
    const stacked = createEngineWrittenStackedBlob();

    expect(
      sharesGroup(JSON.parse(seedShaped).grid.root, "fx-rates", "fx-blotter"),
    ).toBe(false);
    expect(
      sharesGroup(JSON.parse(stacked).grid.root, "fx-rates", "fx-blotter"),
    ).toBe(true);
    // Both carry the version marker only `serializeLayout` writes — the proof
    // that each came out of a real engine's own serialisation rather than
    // being hand-authored dockview JSON the engine merely tolerates.
    expect(JSON.parse(seedShaped).rtcBlobVersion).toBe(DOCK_BLOB_VERSION);
    expect(JSON.parse(stacked).rtcBlobVersion).toBe(DOCK_BLOB_VERSION);
  });

  // QUESTION 1 — does the loaded blob WIN? The rebuild effect reads
  // `store.load(tab)` when it constructs the fresh engine, so a blob written
  // into the store before the counter bump is what the new engine restores.
  it("rebuilds from the blob written just before the counter bump", async () => {
    const recorded = createRecordingStore(createEngineWrittenSeedBlob());
    const preset = createEngineWrittenStackedBlob();
    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store: recorded.store,
      maximized: null,
      collapsed,
      closed: () => {
        return [];
      },
      docked: () => {
        return [];
      },
      layoutResets,
    });
    // The realistic pre-state: by the time anyone loads a preset they have
    // clicked inside the dock, which arms the outgoing engine's dispose flush
    // (#737). Every case here arms it, so none of them measures a rebuild
    // whose predecessor had nothing to say — see the third case, which is
    // about that flush specifically.
    page.pressDockContainer();

    // Four separate groups, and the pair the preset stacks is NOT stacked yet.
    expect(page.groupsAttr()).toBe("4");
    expect(page.sharesGroupInDom("fx-rates", "fx-blotter")).toBe(false);

    recorded.store.save("fx", preset);
    batch(() => {
      setCollapsed(["fx-analytics"]);
      setLayoutResets(1);
    });

    // The preset's OWN shape, in the live DOM: three groups because fx-rates
    // and fx-blotter now share one, which the "fx" seed's conversion can
    // never produce on its own.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("3");
    });
    expect(page.sharesGroupInDom("fx-rates", "fx-blotter")).toBe(true);
    expect(page.bodyVisible("fx-positions-body")).toBe(true);
    expect(page.bodyVisible("fx-rates-body")).toBe(true);
  });

  // QUESTION 2 — does layer 2 replay onto the NEW engine, or is it lost to the
  // dispose? The collapse is written in the SAME batch as the counter bump, so
  // nothing but the rebuild's own `setLiveEngine(fresh)` re-run can carry it
  // onto the engine that ends up mounted.
  it("replays a collapse that arrives with the load onto the rebuilt engine", async () => {
    const recorded = createRecordingStore(createEngineWrittenSeedBlob());
    const preset = createEngineWrittenStackedBlob();
    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store: recorded.store,
      maximized: null,
      collapsed,
      closed: () => {
        return [];
      },
      docked: () => {
        return [];
      },
      layoutResets,
    });
    page.pressDockContainer();

    // Nothing is collapsed before the load, and the captured preset carries no
    // strip geometry of its own (`createEngineWrittenStackedBlob` never
    // collapses anything) — so a strip afterwards can only be the replay.
    expect(page.stripMarked("fx-analytics")).toBe(false);
    expect(preset).not.toContain("rtcStripGeometry");

    recorded.store.save("fx", preset);
    batch(() => {
      setCollapsed(["fx-analytics"]);
      setLayoutResets(1);
    });

    await page.waitFor(() => {
      expect(page.stripMarked("fx-analytics")).toBe(true);
    });

    // And the engine wearing that strip really is the one built from the
    // preset — not a surviving pre-load engine that merely took the collapse.
    expect(page.sharesGroupInDom("fx-rates", "fx-blotter")).toBe(true);
  });

  // QUESTION 3 — can the OUTGOING engine overwrite the preset? Its `dispose()`
  // flushes one final serialize of the pre-load arrangement once a pointer has
  // touched the dock (#737), and that flush runs INSIDE the rebuild, after the
  // preset write and before the fresh engine reads the store — so an
  // unsuppressed flush would replace the preset with the old layout and the
  // rebuild would restore the old layout back. `pressDockContainer` arms that
  // flush: jsdom's untouched engine would otherwise skip it and this case
  // would pass with the hazard simply absent.
  it("lets no save from the outgoing engine replace the loaded blob", async () => {
    const recorded = createRecordingStore(createEngineWrittenSeedBlob());
    const preset = createEngineWrittenStackedBlob();
    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store: recorded.store,
      maximized: null,
      collapsed,
      closed: () => {
        return [];
      },
      docked: () => {
        return [];
      },
      layoutResets,
    });
    page.pressDockContainer();

    recorded.store.save("fx", preset);
    // Forget the deliberate preset write itself, so what remains recorded is
    // exactly the writes the ENGINES made across the rebuild.
    recorded.forgetSaves();
    batch(() => {
      setCollapsed(["fx-analytics"]);
      setLayoutResets(1);
    });

    // The replayed collapse changes the fresh engine's geometry, so a save
    // IS due once the engine's 250 ms debounce elapses. Waiting for it (rather
    // than for a fixed delay) is also what keeps the loop below from passing
    // over an empty array.
    await page.waitFor(() => {
      expect(recorded.saved.length).toBeGreaterThan(0);
    });

    // EVERY post-load write, not just the last: an unsuppressed dispose flush
    // lands as `saved[0]` and would be invisible to a last-one-only check.
    for (const blob of recorded.saved) {
      expect(
        sharesGroup(JSON.parse(blob).grid.root, "fx-rates", "fx-blotter"),
      ).toBe(true);
    }

    // And the tab's LAST word still carries the preset's structure.
    expect(
      sharesGroup(
        JSON.parse(recorded.currentBlob()).grid.root,
        "fx-rates",
        "fx-blotter",
      ),
    ).toBe(true);
  });

  // QUESTION 4 — a Jarvis-docked panel is layer-2 MEMBERSHIP, not blob-owned
  // (spec ruling P2 keeps docked panels out of presets entirely), so a preset
  // captured without one must not undock it. The rebuild's construction-time
  // `dynamicPanels` reconciliation is what re-adds it.
  it("re-adds a docked panel the loaded blob does not contain", async () => {
    const recorded = createRecordingStore(createEngineWrittenSeedBlob());
    const preset = createEngineWrittenStackedBlob();
    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    // The premise: the preset genuinely lacks the docked panel, so its
    // presence afterwards is the reconciliation's doing and nothing else.
    expect(JSON.parse(preset).panels["panel-dyn-1"]).toBeUndefined();

    page.mount({
      tab: "fx",
      registry,
      store: recorded.store,
      maximized: null,
      collapsed,
      closed: () => {
        return [];
      },
      docked: () => {
        return ["panel-dyn-1"];
      },
      layoutResets,
    });
    page.pressDockContainer();

    // fx's 4 seed leaves plus the docked panel.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);

    recorded.store.save("fx", preset);
    batch(() => {
      setCollapsed(["fx-analytics"]);
      setLayoutResets(1);
    });

    // The preset's 3 groups plus the re-reconciled docked panel.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);
    expect(page.sharesGroupInDom("fx-rates", "fx-blotter")).toBe(true);
  });

  // QUESTION 5 — "a live pop-out closes and its panel lands per the preset" —
  // has NO case here, deliberately. The 6a finding stands: jsdom cannot open a
  // pop-out window at all, so `popoutPanel` only ever resolves false down its
  // blocked-`window.open` branch and the load has no live pop-out to close. A
  // case asserting `data-popped` stays empty across the load would assert an
  // ABSENCE nothing in this environment could have produced — it would pass
  // whatever the rebuild does to a real pop-out. The question is deferred to
  // the Gherkin e2e (Task 10), where a real browser owns the window.
});

interface DockviewPanelMeta {
  id: string;
  contentComponent: string;
  title: string;
}

function panelMeta(id: string): DockviewPanelMeta {
  return { id, contentComponent: "rtc-panel", title: id };
}

/** A recording `DockLayoutStore` over the real in-memory one — the sibling
 * docked spec's inline wrapper, lifted into a factory because four cases here
 * need it. `saved` is what the ENGINES wrote (plus any deliberate write a case
 * has not yet forgotten), oldest first. Mirrors the react twin. */
interface RecordingDockLayoutStore {
  readonly store: DockLayoutStore;
  readonly saved: string[];
  /** What `load("fx")` would now return — the tab's last word. Throws if the
   * tab holds nothing, so an empty store can never read as "unchanged". */
  currentBlob(): string;
  /** Drops the recorded writes, so a later assertion sees only what was
   * written after this point. */
  forgetSaves(): void;
}

function createRecordingStore(initialBlob: string): RecordingDockLayoutStore {
  const inner = new InMemoryDockLayoutStore();
  inner.save("fx", initialBlob);
  const saved: string[] = [];

  return {
    store: {
      load: (tab: string): string | null => {
        return inner.load(tab);
      },
      save: (tab: string, blob: string): void => {
        inner.save(tab, blob);
        saved.push(blob);
      },
      clear: (tab: string): void => {
        inner.clear(tab);
      },
    },
    saved,
    currentBlob: (): string => {
      const blob = inner.load("fx");

      if (blob === null) {
        throw new Error('the "fx" tab holds no blob');
      }

      return blob;
    },
    forgetSaves: (): void => {
      saved.length = 0;
    },
  };
}

/** Blob A: what a real engine writes for the "fx" seed — fx-rates and
 * fx-blotter in SEPARATE groups. */
function createEngineWrittenSeedBlob(): string {
  return createEngineWrittenBlob(null);
}

/** Blob B, the "preset": what a real engine writes once fx-rates and
 * fx-blotter are TABBED into one group — a shape the "fx" seed's own
 * conversion can never produce, which is what makes the stack a witness.
 *
 * Captured from `createDockEngine`'s own `onLayoutChange` rather than
 * hand-written (the brief's rule, and the repo's: a blob the engine merely
 * TOLERATES is not the blob a preset save would hold). The stacked
 * arrangement is REACHED by restoring the hand-authored driver JSON below —
 * the same sanctioned schema `@rtc/layout-dockview`'s own tests and the
 * sibling docked spec already hand-author — because the public `DockEngine`
 * surface has no "stack these two" primitive (dockview only stacks by drag,
 * which jsdom cannot perform). The driver is the INPUT; what this returns is
 * the engine's own serialisation of the result, version marker and design
 * pins included. */
function createEngineWrittenStackedBlob(): string {
  return createEngineWrittenBlob(createStackedRatesAndBlotterDriverJson());
}

/** Restores `driverBlob` (or the "fx" seed, for null) into a real, throwaway
 * engine and returns the blob that engine writes for it.
 *
 * The capture mechanism is `dispose()`'s final flush, armed by a `pointerdown`
 * on the container: `createDockEngine` only serialises on a layout CHANGE
 * (debounced) or on a dispose a pointer has armed, never at construction — so
 * arming and disposing yields exactly one synchronous `onLayoutChange` for the
 * arrangement as restored, with no timers to wait out and no mutation that
 * could perturb the very structure being captured. */
function createEngineWrittenBlob(driverBlob: string | null): string {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let captured: string | null = null;
  const engine = createDockEngine({
    container,
    seed: createDefaultLayoutPort("fx").initial.root,
    blob: driverBlob,
    panels: {
      title: (panelId: string): string => {
        return panelId;
      },
      mount: (): (() => void) => {
        return () => {};
      },
    },
    onLayoutChange: (blob: string): void => {
      captured = blob;
    },
    debounceMs: 60_000,
  });

  container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  engine.dispose();
  container.remove();

  if (captured === null) {
    throw new Error("the engine wrote no blob on dispose");
  }

  return captured;
}

/** The INPUT that drives an engine into the stacked arrangement — a real,
 * valid dockview blob (the schema `@rtc/layout-dockview`'s own
 * `createTwoTabGroupLayout` and the sibling docked spec both hand-author) with
 * fx-rates and fx-blotter tabbed into one shared group. Never loaded by the
 * bridge under test: only `createEngineWrittenBlob` reads it, and what reaches
 * the bridge is the engine's own serialisation of the result. */
function createStackedRatesAndBlotterDriverJson(): string {
  return JSON.stringify({
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            size: 700,
            data: {
              id: "g-stack",
              views: ["fx-rates", "fx-blotter"],
              activeView: "fx-rates",
            },
          },
          {
            type: "branch",
            size: 300,
            data: [
              {
                type: "leaf",
                size: 400,
                data: {
                  id: "g-analytics",
                  views: ["fx-analytics"],
                  activeView: "fx-analytics",
                },
              },
              {
                type: "leaf",
                size: 400,
                data: {
                  id: "g-positions",
                  views: ["fx-positions"],
                  activeView: "fx-positions",
                },
              },
            ],
          },
        ],
      },
      width: 1200,
      height: 800,
      orientation: "HORIZONTAL",
    },
    panels: {
      "fx-rates": panelMeta("fx-rates"),
      "fx-blotter": panelMeta("fx-blotter"),
      "fx-analytics": panelMeta("fx-analytics"),
      "fx-positions": panelMeta("fx-positions"),
    },
  });
}

/** Whether panels `a` and `b` sit in the SAME leaf's `views` array anywhere
 * under `node` — the structural stack witness on a PERSISTED blob, mirroring
 * the sibling docked spec's identical helper (`sharesGroupInDom` is its live-
 * DOM counterpart). */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function sharesGroup(node: any, a: string, b: string): boolean {
  if (node.type === "leaf") {
    const views: string[] = node.data?.views ?? [];

    return views.includes(a) && views.includes(b);
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  return ((node.data ?? []) as any[]).some((child) => {
    return sharesGroup(child, a, b);
  });
}

/** The cast target for the ResizeObserver stub in `beforeAll` above — see the
 * sibling docked spec's comment for why this is declared outside the narrowed
 * guard. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}

const page = dockviewLayoutEngineDockedPage();

const registry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">RATES</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">ANALYTICS</div>;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body">POSITIONS</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">BLOTTER</div>;
  },
  "panel-dyn-1": () => {
    return <div data-testid="panel-dyn-1-body">DYN</div>;
  },
};
