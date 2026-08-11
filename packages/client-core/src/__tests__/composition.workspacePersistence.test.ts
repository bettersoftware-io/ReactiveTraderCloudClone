import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { PanelSpecV1 } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
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
}

function bootApp(seed: string | null): BootedApp {
  const preferences = new PreferencesSimulator({ workspaceLayoutSeed: seed });
  const { presenters } = createApp({
    ...createSimulatorPorts({
      preferences,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: new ConnectionEventsSimulator(),
  });
  return { presenters, preferences };
}

async function layoutOf(
  presenters: Presenters,
  tab: WorkspaceTab,
): Promise<LayoutState> {
  return firstValueFrom(presenters.layoutFor(tab).state$);
}

async function storedPayload(
  preferences: PreferencesSimulator,
): Promise<WorkspaceLayoutV1 | null> {
  return parseWorkspaceLayout(
    await firstValueFrom(preferences.workspaceLayout$()),
  );
}
