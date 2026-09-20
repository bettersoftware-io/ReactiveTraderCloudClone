import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  type PanelId,
  type WorkspaceTab,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineBridgePage } from "#tests/ui/pages/DockviewLayoutEngineBridgePage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (mirrors the react twin).
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

/** Phase 6b Task 7 — the `onSnapshotSourceChange` slot, Solid twin of
 * `client-react`'s identically-named spec: hands the controller a `() =>
 * string` that reads the LIVE engine's blob on demand, right after
 * construction, and `null` right before that engine is disposed. See that
 * file's describe doc for why this exists. */
describe("dockview bridge layout-snapshot registration", () => {
  it("hands the controller a live source on mount, matching the store's next write after a panel docks", async () => {
    const recorded = createRecordingStore();
    const reports: SnapshotSourceReport[] = [];
    const [docked, setDocked] = createSignal<readonly PanelId[]>([]);

    page.mount({
      registry,
      store: recorded.store,
      docked,
      onSnapshotSourceChange: (
        tab: WorkspaceTab,
        source: (() => string) | null,
      ): void => {
        reports.push({ tab, source });
      },
    });

    expect(reports).toHaveLength(1);
    const mounted = reports[0];

    if (mounted === undefined || mounted.source === null) {
      throw new Error("expected a live source registered on mount");
    }

    expect(mounted.tab).toBe("fx");

    setDocked(["panel-dyn-1"]);

    await page.waitFor(() => {
      expect(recorded.saved.length).toBeGreaterThan(0);
    });

    // Called well after the debounced save already landed — proving the
    // registered source is a LIVE reader (re-invokable any time), never a
    // value frozen at registration, and that it agrees with what the store
    // now holds for the very same arrangement.
    expect(mounted.source()).toBe(recorded.currentBlob());
  });

  it("re-registers on a workspace-reset rebuild: null, then a NEW source reflecting the REBUILT engine", async () => {
    const recorded = createRecordingStore();
    recorded.store.save("fx", createStackedRatesAndBlotterBlob());
    const reports: SnapshotSourceReport[] = [];
    const [layoutResets, setLayoutResets] = createSignal(0);

    function recordSnapshotSourceReport(
      tab: WorkspaceTab,
      source: (() => string) | null,
    ): void {
      reports.push({ tab, source });
    }

    page.mount({
      registry,
      store: recorded.store,
      layoutResets,
      onSnapshotSourceChange: recordSnapshotSourceReport,
    });

    expect(reports).toHaveLength(1);
    const beforeReset = reports[0];

    if (beforeReset === undefined || beforeReset.source === null) {
      throw new Error("expected a live source registered on mount");
    }

    // The premise: the mounted engine really did load the stacked blob — its
    // OWN live snapshot shows fx-rates and fx-blotter sharing a group, a
    // shape the "fx" seed's own conversion can never produce.
    expect(
      sharesGroup(
        JSON.parse(beforeReset.source()).grid.root,
        "fx-rates",
        "fx-blotter",
      ),
    ).toBe(true);

    // What a workspace reset does in the real app: clear the persisted blob,
    // then bump the counter — the rebuilt engine loads the tab's now-CLEARED
    // (so back-to-seed, unstacked) blob.
    recorded.store.clear("fx");
    setLayoutResets(1);

    await page.waitFor(() => {
      expect(reports).toHaveLength(3);
    });

    const unregistered = reports[1];
    const afterReset = reports[2];

    expect(unregistered?.source).toBeNull();

    if (afterReset === undefined || afterReset.source === null) {
      throw new Error("expected a live source re-registered after the reset");
    }

    expect(afterReset.source).not.toBe(beforeReset.source);

    const afterResetRoot = JSON.parse(afterReset.source()).grid.root;

    // MUTATE-CHECK: the rebuilt engine no longer shares fx-rates/fx-blotter
    // in one group (it rebuilt from the seed, unstacked) — a source that
    // still read the OLD, disposed (stacked) engine would ALSO report
    // `false` here (a disposed engine's `snapshotLayout()` serializes every
    // leaf with an EMPTY `views` array, which trivially fails `sharesGroup`
    // too — the exact "absence read as a clean reading" shape), so a bare
    // negative assertion alone would not discriminate the two. The positive
    // witness below is what actually does: every leaf still carries a REAL
    // panel view, which only the freshly-built (not disposed) engine's own
    // serialize produces.
    expect(sharesGroup(afterResetRoot, "fx-rates", "fx-blotter")).toBe(false);
    expect(everyLeafHasViews(afterResetRoot)).toBe(true);
  });

  it("unregisters with null as the last call on unmount", () => {
    const reports: SnapshotSourceReport[] = [];

    page.mount({
      registry,
      store: new InMemoryDockLayoutStore(),
      onSnapshotSourceChange: (
        tab: WorkspaceTab,
        source: (() => string) | null,
      ): void => {
        reports.push({ tab, source });
      },
    });

    expect(reports.at(-1)?.source).not.toBeNull();

    page.unmountAll();

    expect(reports.at(-1)).toEqual({ tab: "fx", source: null });
  });
});

interface SnapshotSourceReport {
  readonly tab: WorkspaceTab;
  readonly source: (() => string) | null;
}

interface DockviewPanelMeta {
  id: string;
  contentComponent: string;
  title: string;
}

function panelMeta(id: string): DockviewPanelMeta {
  return { id, contentComponent: "rtc-panel", title: id };
}

/** A recording `DockLayoutStore` over the real in-memory one — mirrors the
 * sibling presetLoad spec's identical factory. `saved` is every blob an
 * ENGINE wrote, oldest first; `currentBlob` is the tab's last word. */
interface RecordingDockLayoutStore {
  readonly store: DockLayoutStore;
  readonly saved: string[];
  currentBlob(): string;
}

function createRecordingStore(): RecordingDockLayoutStore {
  const inner = new InMemoryDockLayoutStore();
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
  };
}

/** A REAL, valid dockview blob (the same hand-authored schema the sibling
 * docked/presetLoad specs use) with fx-rates and fx-blotter TABBED into one
 * shared group — a shape the "fx" seed's own conversion can never produce,
 * which is what makes the stack a structural witness. */
function createStackedRatesAndBlotterBlob(): string {
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
 * under `node` — the structural stack witness, mirroring the sibling
 * docked/presetLoad specs' identical helper. */
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

/** Whether EVERY leaf under `node` still carries at least one panel view —
 * the positive half of the rebuild test's discriminator, mirroring the
 * react twin's identical NEW-1 witness. A disposed engine's panel-less
 * serialize produces a grid whose leaves carry `"views":[]`, not a grid
 * missing leaves entirely, and that shape ALSO fails `sharesGroup` — so
 * `sharesGroup(...) === false` alone cannot tell "genuinely rebuilt,
 * unstacked" from "read a disposed, panel-less engine"; this walk is what
 * actually can. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function everyLeafHasViews(node: any): boolean {
  if (node.type === "leaf") {
    const views: unknown[] = node.data?.views ?? [];

    return views.length > 0;
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  return ((node.data ?? []) as any[]).every((child) => {
    return everyLeafHasViews(child);
  });
}

/** The cast target for the ResizeObserver stub in `beforeAll` above — see the
 * sibling docked spec's comment for why this is declared outside the
 * narrowed guard. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}

const page = dockviewLayoutEngineBridgePage();

const registry: PanelRegistry = {
  "fx-rates": () => {
    return <div>RATES</div>;
  },
  "fx-analytics": () => {
    return <div>ANALYTICS</div>;
  },
  "fx-positions": () => {
    return <div>POSITIONS</div>;
  },
  "fx-blotter": () => {
    return <div>BLOTTER</div>;
  },
  "panel-dyn-1": () => {
    return <div>DYN</div>;
  },
};
