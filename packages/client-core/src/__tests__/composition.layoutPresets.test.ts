import { firstValueFrom, from } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  LayoutPresetSummary,
  LayoutState,
  SaveLayoutPresetResult,
} from "@rtc/core-api";
import type { StoredLayoutPreset, WorkspaceTab } from "@rtc/core-logic";
import {
  createDefaultLayoutPort,
  dockedLeafIds,
  InMemoryLayoutPresetStore,
  parseLayoutPresetList,
} from "@rtc/core-logic";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { PanelSpecV1 } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisEvent, JarvisPort } from "#/adapters/jarvisPort";
import { createSimulatorPorts } from "#/adapters/portFactory";
import type { Presenters } from "#/composition";
import { createApp } from "#/composition";

describe("composition — resetWorkspaceLayout leaves saved layouts alone", () => {
  it("leaves every tab's stored preset list byte-identical", () => {
    const store = new InMemoryLayoutPresetStore();

    for (const tab of WORKSPACE_TABS) {
      store.save(tab, JSON.stringify([createStoredPreset(tab)]));
    }

    const before = new Map(
      WORKSPACE_TABS.map((tab) => {
        return [tab, store.load(tab)];
      }),
    );
    const { presenters } = bootApp(store);

    presenters.resetWorkspaceLayout();

    for (const tab of WORKSPACE_TABS) {
      expect(store.load(tab), `${tab}'s preset list`).toBe(before.get(tab));
    }
  });

  it("still leaves the lists alone when the presets presenter has read them", async () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", JSON.stringify([createStoredPreset("fx")]));
    const { presenters } = bootApp(store);
    expect(await summariesOf(presenters, "fx")).toHaveLength(1);

    presenters.resetWorkspaceLayout();

    expect(await summariesOf(presenters, "fx")).toEqual([
      { id: "p1", name: "Wide", savedAt: SAVED_AT, readable: true },
    ]);
  });
});

describe("composition — layoutPresets wiring", () => {
  it("reads the SUPPLIED store, not a fresh fallback", async () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", JSON.stringify([createStoredPreset("fx")]));

    const { presenters } = bootApp(store);

    expect((await summariesOf(presenters, "fx")).map(nameOf)).toEqual(["Wide"]);
  });

  it("falls back to an in-memory store when no port is supplied", async () => {
    const { presenters } = bootApp(undefined);
    presenters.layoutPresets.registerSnapshotSource("fx", () => {
      return BLOB;
    });

    expect(presenters.layoutPresets.save("fx", "Wide").status).toBe("saved");
    expect((await summariesOf(presenters, "fx")).map(nameOf)).toEqual(["Wide"]);
  });

  it("saves the tab's live layer 2 and restores it on load, bumping the rebuild counter once", async () => {
    const store = new InMemoryLayoutPresetStore();
    const { presenters } = bootApp(store);
    presenters.layoutPresets.registerSnapshotSource("fx", () => {
      return BLOB;
    });
    presenters.layoutFor("fx").intents.maximize("fx-rates");

    const saved = presenters.layoutPresets.save("fx", "Wide");
    expect(saved.status).toBe("saved");

    // Diverge from what was saved, then load it back.
    presenters.layoutFor("fx").intents.restore();
    expect((await layoutOf(presenters, "fx")).maximized).toBeNull();

    const rebuilds: number[] = [];
    const sub = presenters.workspaceLayoutResets$.subscribe((count) => {
      rebuilds.push(count);
    });
    expect(presenters.layoutPresets.load("fx", idOf(saved))).toBe(true);
    sub.unsubscribe();

    expect((await layoutOf(presenters, "fx")).maximized).toBe("fx-rates");
    expect(presenters.dockLayoutStore.load("fx")).toBe(BLOB);
    expect(rebuilds).toEqual([0, 1]);
  });

  it("strips a docked Jarvis panel out of the saved record and re-docks it on load (ruling P2)", async () => {
    const store = new InMemoryLayoutPresetStore();
    const { presenters, spawnPanel } = bootApp(store);
    presenters.layoutPresets.registerSnapshotSource("fx", () => {
      return BLOB;
    });
    spawnPanel("jarvis-1");
    presenters.dockPanel("jarvis-1");
    expect(await dockedLeavesOf(presenters, "fx")).toEqual(["jarvis-1"]);

    const saved = presenters.layoutPresets.save("fx", "Wide");

    const stored = readablePresetsIn(store, "fx");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.layout.docked).toEqual([]);
    expect(dockedLeavesIn(stored[0]?.layout.layout, "fx")).toEqual([]);

    presenters.layoutPresets.load("fx", idOf(saved));

    // The live panel was never dismissed, and its leaf is back in the tree.
    expect(await dockedLeavesOf(presenters, "fx")).toEqual(["jarvis-1"]);
    const docked = await firstValueFrom(presenters.jarvisPanels.dockedPanels$);
    expect(
      docked.map((panel) => {
        return panel.panelId;
      }),
    ).toEqual(["jarvis-1"]);
  });

  it("resetTab returns one tab to its default tree, leaving the others alone", async () => {
    const { presenters } = bootApp(undefined);
    presenters.layoutFor("fx").intents.maximize("fx-rates");
    presenters.layoutFor("credit").intents.maximize("credit-rfqs");

    presenters.layoutPresets.resetTab("fx");

    expect(await layoutOf(presenters, "fx")).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
    expect((await layoutOf(presenters, "credit")).maximized).toBe(
      "credit-rfqs",
    );
  });
});

function bootApp(
  layoutPresetStore: InMemoryLayoutPresetStore | undefined,
): BootedApp {
  let pendingPanelId = "";
  // Stub JarvisPort: one synchronous panel event per turn — the only way to
  // mint a live desk panel, mirroring composition.workspacePersistence's own
  // harness.
  const jarvis: JarvisPort = {
    ask: () => {
      const turn: readonly JarvisEvent[] = [
        { type: "panel", panelId: pendingPanelId, spec: SPEC },
        { type: "done" },
      ];
      return from(turn);
    },
    confirm: () => {
      // no confirmations in these specs
    },
  };

  const { presenters } = createApp({
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    jarvis,
    connectionEvents: new ConnectionEventsSimulator(),
    layoutPresetStore,
  });

  return {
    presenters,
    spawnPanel: (panelId: string) => {
      pendingPanelId = panelId;
      presenters.jarvis.intents.send(`spawn ${panelId}`);
    },
  };
}

interface BootedApp {
  readonly presenters: Presenters;
  readonly spawnPanel: (panelId: string) => void;
}

async function summariesOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<readonly LayoutPresetSummary[]> {
  return firstValueFrom(presenters.layoutPresets.presetsFor(tab));
}

async function layoutOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<LayoutState> {
  return firstValueFrom(presenters.layoutFor(tab).state$);
}

/** The docked (tree-foreign) leaf ids of `tab`'s live tree. */
async function dockedLeavesOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<readonly string[]> {
  return dockedLeavesIn(await layoutOf(presenters, tab), tab);
}

/** The docked (tree-foreign) leaf ids of `state`, measured against `tab`'s
 * DEFAULT static roster. Throws rather than defaulting on a missing state, so
 * an absent record cannot read as a clean "nothing docked". */
function dockedLeavesIn(
  state: LayoutState | undefined,
  tab: WorkspaceTab,
): readonly string[] {
  if (state === undefined) {
    throw new Error(`no layout state to measure for ${tab}`);
  }

  return dockedLeafIds(
    state.root,
    dockedLeafIds(createDefaultLayoutPort(tab).initial.root, []),
  );
}

function readablePresetsIn(
  store: InMemoryLayoutPresetStore,
  tab: WorkspaceTab,
): readonly StoredLayoutPreset[] {
  return parseLayoutPresetList(tab, store.load(tab)).entries.flatMap(
    (entry) => {
      return entry.readable ? [entry.preset] : [];
    },
  );
}

function nameOf(summary: LayoutPresetSummary): string {
  return summary.name;
}

/** The id a successful `save` returned — narrowed, so a non-"saved" result
 * fails the case instead of silently loading `undefined`. */
function idOf(result: SaveLayoutPresetResult): string {
  if (result.status !== "saved") {
    throw new Error(`expected a saved preset, got ${result.status}`);
  }

  return result.id;
}

function createStoredPreset(tab: WorkspaceTab): StoredLayoutPreset {
  return {
    v: 1,
    id: "p1",
    name: "Wide",
    savedAt: SAVED_AT,
    blob: BLOB,
    layout: { layout: createDefaultLayoutPort(tab).initial, docked: [] },
  };
}

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "equities",
  "admin",
];

const SAVED_AT = "2026-09-20T10:00:00.000Z";
const BLOB = JSON.stringify({ grid: { root: "stored" } });

const SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};
