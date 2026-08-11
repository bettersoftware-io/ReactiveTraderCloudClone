import { firstValueFrom, from } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import type { WorkspaceTab } from "#/layout/defaultLayoutPort";
import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
import { dockedLeafIds, insertDockedLeaf } from "#/layout/dockColumn";
import type { LayoutState } from "#/layout/layoutPort";
import type {
  PersistedTabLayout,
  WorkspaceLayoutV1,
} from "#/layout/workspaceLayoutPersistence";
import {
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
} from "#/layout/workspaceLayoutPersistence";

const SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** Longer than the writer's own debounce, so one advance always flushes. */
const PAST_DEBOUNCE_MS = 600;

describe("composition — workspace-layout rehydration", () => {
  it("seeds layoutFor from the persisted tree", async () => {
    const persisted = dockedTab("fx", ["jarvis-1"]);
    const { presenters } = bootApp(
      serializeWorkspaceLayout({ v: 1, tabs: { fx: persisted } }),
    );

    expect(await layoutOf(presenters, "fx")).toEqual(persisted.layout);
  });

  it("restores each persisted docked panel as a live docked panel", async () => {
    const { presenters } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );

    const docked = await firstValueFrom(presenters.jarvisPanels.dockedPanels$);
    expect(
      docked.map((panel) => {
        return panel.panelId;
      }),
    ).toEqual(["jarvis-1"]);
    expect(docked[0]?.title).toBe(SPEC.title);
    expect(docked[0]?.status).toBe("live");
  });

  it("a corrupt payload boots the default trees with no docked panels", async () => {
    const { presenters } = bootApp("{ not json");

    expect(await layoutOf(presenters, "fx")).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
    expect(await firstValueFrom(presenters.jarvisPanels.dockedPanels$)).toEqual(
      [],
    );
  });

  it("leaves an unseeded app on the default trees", async () => {
    const { presenters } = bootApp(null);

    expect(await layoutOf(presenters, "equities")).toEqual(
      createDefaultLayoutPort("equities").initial,
    );
  });
});

describe("composition — workspace-layout writer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not write until the debounce elapses, then writes once for the burst", async () => {
    const { presenters, preferences } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );
    const write = vi.spyOn(preferences, "setWorkspaceLayout");

    presenters.undockPanel("jarvis-1");
    presenters.dockPanel("jarvis-1");
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("persists a docked panel under the tab that was ACTIVE when it was docked, not the tab shown at write time", async () => {
    const { presenters, preferences } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );

    // Undock it from fx, move to equities, dock it there, then navigate away
    // again before the debounced write lands.
    presenters.undockPanel("jarvis-1");
    presenters.workspaceNav.intents.switchTab("equities");
    presenters.dockPanel("jarvis-1");
    presenters.workspaceNav.intents.switchTab("fx");

    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    const payload = await storedPayload(preferences);
    expect(payload?.tabs.equities?.docked).toEqual([
      { panelId: "jarvis-1", spec: SPEC },
    ]);
    expect(payload?.tabs.fx?.docked).toEqual([]);
    expect(payload?.tabs.fx?.layout).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
  });

  it("docks the panel into the active tab's tree and undocks it from the tab it was docked into", async () => {
    const { presenters } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );

    presenters.undockPanel("jarvis-1");
    expect(await layoutOf(presenters, "fx")).toEqual(
      createDefaultLayoutPort("fx").initial,
    );

    presenters.workspaceNav.intents.switchTab("equities");
    presenters.dockPanel("jarvis-1");

    const equities = await layoutOf(presenters, "equities");
    expect(
      dockedLeafIds(
        equities.root,
        dockedLeafIds(createDefaultLayoutPort("equities").initial.root, []),
      ),
    ).toEqual(["jarvis-1"]);

    // Docked from equities, so it undocks from equities even while fx is shown.
    // Asserted structurally (no docked leaves left) rather than by deep
    // equality with the default tree: an insert/remove round trip renormalizes
    // the sibling fractions, which lands 0.78 back as 0.7799999999999999.
    presenters.workspaceNav.intents.switchTab("fx");
    presenters.undockPanel("jarvis-1");
    const undocked = await layoutOf(presenters, "equities");
    expect(
      dockedLeafIds(
        undocked.root,
        dockedLeafIds(createDefaultLayoutPort("equities").initial.root, []),
      ),
    ).toEqual([]);
  });

  it("dockPanel on an unknown panel changes no tree (the panels machine owns the no-op rules)", async () => {
    const { presenters, preferences } = bootApp(null);
    const write = vi.spyOn(preferences, "setWorkspaceLayout");

    presenters.dockPanel("never-existed");

    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    expect(write).not.toHaveBeenCalled();
  });

  it("leaves a tab whose layout machine was never created untouched in the payload", async () => {
    const seeded: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: dockedTab("fx", ["jarvis-1"]),
        credit: dockedTab("credit", ["jarvis-2"]),
      },
    };

    const { presenters, preferences } = bootApp(
      serializeWorkspaceLayout(seeded),
    );

    // Only fx is ever touched this session — credit's machine is never built.
    presenters.undockPanel("jarvis-1");
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    const payload = await storedPayload(preferences);
    expect(payload?.tabs.credit).toEqual(seeded.tabs.credit);
    expect(payload?.tabs.fx?.docked).toEqual([]);
  });

  it("resetWorkspaceLayout clears the preference, the trees, and every docked panel", async () => {
    const { presenters, preferences } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );

    // Touch fx so its machine exists and holds the restored tree.
    expect(await layoutOf(presenters, "fx")).not.toEqual(
      createDefaultLayoutPort("fx").initial,
    );

    presenters.resetWorkspaceLayout();

    expect(await firstValueFrom(preferences.workspaceLayout$())).toBeNull();
    expect(await layoutOf(presenters, "fx")).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
    expect(await firstValueFrom(presenters.jarvisPanels.panels$)).toEqual([]);

    // Whatever the reset's own state changes write afterwards must still be a
    // readable, docked-free payload — never a half-cleared one.
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    const payload = await storedPayload(preferences);

    if (payload !== null) {
      expect(payload.tabs.fx?.docked).toEqual([]);
      expect(payload.tabs.fx?.layout).toEqual(
        createDefaultLayoutPort("fx").initial,
      );
    }
  });

  // `layoutFor` is lazy, so the boot seed is consulted again the first time
  // each tab is opened — which for a tab the user never visited happens AFTER
  // a Reset. A `const` seed would hand that tab the discarded tree back,
  // docked leaves and all, and the next write would re-persist it.
  it("a tab opened for the first time AFTER a reset gets the default tree, not the discarded one", async () => {
    const { presenters, preferences } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: {
          fx: dockedTab("fx", ["jarvis-1"]),
          credit: dockedTab("credit", ["jarvis-2"]),
        },
      }),
    );

    // Only fx is open when the user hits Reset; credit's machine does not exist.
    expect(await dockedLeavesOf(presenters, "fx")).toEqual(["jarvis-1"]);
    presenters.resetWorkspaceLayout();

    expect(await layoutOf(presenters, "credit")).toEqual(
      createDefaultLayoutPort("credit").initial,
    );
    expect(await firstValueFrom(presenters.jarvisPanels.panels$)).toEqual([]);

    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
    const payload = await storedPayload(preferences);
    expect(payload?.tabs.credit?.docked ?? []).toEqual([]);
  });
});

describe("composition — dismissing a docked panel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detaches the docked leaf from its tab's tree, leaving no stranded pane", async () => {
    const { presenters } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["jarvis-1"]) },
      }),
    );

    presenters.dismissPanel("jarvis-1");

    expect(await dockedLeavesOf(presenters, "fx")).toEqual([]);
    expect(await firstValueFrom(presenters.jarvisPanels.panels$)).toEqual([]);
  });

  it("does not evict an unrelated floating panel (why the leaf is detached directly rather than by undocking first)", async () => {
    const { presenters, spawnPanel } = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { fx: dockedTab("fx", ["docked-1"]) },
      }),
    );

    // MAX_LIVE_PANELS floating panels alongside the docked one: routing the
    // dismissal through undockPanel would re-admit the docked panel to the
    // floating set, evicting the oldest of these.
    for (const id of ["float-1", "float-2", "float-3", "float-4"]) {
      spawnPanel(id);
    }

    presenters.dismissPanel("docked-1");

    const panels = await firstValueFrom(presenters.jarvisPanels.panels$);
    expect(
      panels.map((panel) => {
        return panel.panelId;
      }),
    ).toEqual(["float-1", "float-2", "float-3", "float-4"]);
  });

  it("rewrites the stored entry of a tab this session never opened, so the panel does not come back on reload", async () => {
    const first = bootApp(
      serializeWorkspaceLayout({
        v: 1,
        tabs: { credit: dockedTab("credit", ["jarvis-2"]) },
      }),
    );

    // credit is never opened — only the dismissal itself reaches that tab.
    first.presenters.dismissPanel("jarvis-2");
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    const raw = await storedRaw(first.preferences);
    const second = bootApp(raw);

    expect(
      await firstValueFrom(second.presenters.jarvisPanels.panels$),
    ).toEqual([]);
    expect(await dockedLeavesOf(second.presenters, "credit")).toEqual([]);
  });
});

describe("composition — reload round trip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dock on fx, switch to credit, reload → the panel comes back docked under fx", async () => {
    const first = bootApp(null);
    first.spawnPanel("jarvis-1");
    first.presenters.dockPanel("jarvis-1");
    // Navigate away before the debounced write fires — the write must still
    // attribute the panel to fx, the tab it was docked into.
    first.presenters.workspaceNav.intents.switchTab("credit");
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);

    const raw = await storedRaw(first.preferences);
    expect(raw).not.toBeNull();

    const second = bootApp(raw);

    const docked = await firstValueFrom(
      second.presenters.jarvisPanels.dockedPanels$,
    );
    expect(
      docked.map((panel) => {
        return panel.panelId;
      }),
    ).toEqual(["jarvis-1"]);
    expect(docked[0]?.status).toBe("live");
    expect(docked[0]?.title).toBe(SPEC.title);

    expect(await dockedLeavesOf(second.presenters, "fx")).toEqual(["jarvis-1"]);
    expect(await dockedLeavesOf(second.presenters, "credit")).toEqual([]);
  });
});

function dockedTab(
  tab: WorkspaceTab,
  panelIds: readonly string[],
): PersistedTabLayout {
  const initial = createDefaultLayoutPort(tab).initial;
  const staticIds = dockedLeafIds(initial.root, []);
  let root = initial.root;

  for (const panelId of panelIds) {
    root = insertDockedLeaf(root, panelId, staticIds);
  }

  return {
    layout: { ...initial, root },
    docked: panelIds.map((panelId) => {
      return { panelId, spec: SPEC };
    }),
  };
}

interface BootedApp {
  readonly presenters: Presenters;
  readonly preferences: PreferencesSimulator;
  /** Spawn a live FLOATING desk panel, the way the real app does: through a
   * `"panel"` reply event on a Jarvis turn. Nothing else can create one —
   * the panels machine mints no ids of its own — so a test that wants to
   * exercise the DOCK path (rather than boot restore) has to send a turn. */
  readonly spawnPanel: (panelId: string) => void;
}

function bootApp(seed: string | null): BootedApp {
  const preferences = new PreferencesSimulator({ workspaceLayoutSeed: seed });
  let pendingPanelId = "";
  // Stub JarvisPort: one synchronous panel event per turn. Not a
  // `WsJarvisAdapter`, so `createJarvisMachine` treats Jarvis as always
  // available (composition's own documented simulator branch) and `send`
  // is not gated.
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
      preferences,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    jarvis,
    connectionEvents: new ConnectionEventsSimulator(),
  });
  return {
    presenters,
    preferences,
    spawnPanel: (panelId: string) => {
      pendingPanelId = panelId;
      presenters.jarvis.intents.send(`spawn ${panelId}`);
    },
  };
}

async function layoutOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<LayoutState> {
  return firstValueFrom(presenters.layoutFor(tab).state$);
}

/** The docked (tree-foreign) leaf ids of `tab`'s live tree — asserted instead
 * of deep-equalling the default tree, since an insert/remove round trip
 * renormalizes sibling fractions (0.78 → 0.7799999999999999). */
async function dockedLeavesOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<readonly string[]> {
  const layout = await layoutOf(presenters, tab);
  return dockedLeafIds(
    layout.root,
    dockedLeafIds(createDefaultLayoutPort(tab).initial.root, []),
  );
}

async function storedRaw(
  preferences: PreferencesSimulator,
): Promise<string | null> {
  return firstValueFrom(preferences.workspaceLayout$());
}

async function storedPayload(
  preferences: PreferencesSimulator,
): Promise<WorkspaceLayoutV1 | null> {
  return parseWorkspaceLayout(await storedRaw(preferences));
}
