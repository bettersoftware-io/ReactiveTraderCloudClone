import { Subject, VirtualTimeScheduler } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { WorkspaceTab } from "../defaultLayoutPort";
import { createDefaultLayoutPort } from "../defaultLayoutPort";
import { dockedLeafIds, insertDockedLeaf } from "../dockColumn";
import type { LayoutState } from "../layoutPort";
import type { WorkspaceLayoutV1 } from "../workspaceLayoutPersistence";
import {
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
} from "../workspaceLayoutPersistence";
import type { DockedPanelPlacement } from "../workspacePersistenceWriter";
import {
  createWorkspacePersistenceWriter,
  resetUnwritablePayloadWarning,
} from "../workspacePersistenceWriter";

const SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

describe("createWorkspacePersistenceWriter", () => {
  it("coalesces a burst of kicks into a single write", () => {
    const h = harness(null);
    h.setLayouts(new Map([["fx", withDocked("fx", [])]]));

    h.kick();
    h.kick();
    h.kick();
    expect(h.writes).toHaveLength(0);

    h.flush();
    expect(h.writes).toHaveLength(1);
  });

  it("writes nothing until the debounce elapses, and once per later burst", () => {
    const h = harness(null);
    h.setLayouts(new Map([["fx", withDocked("fx", [])]]));

    h.kick();
    h.flush();
    h.kick();
    h.flush();

    expect(h.writes).toHaveLength(2);
  });

  it("persists a docked panel under the tab it was docked into, not the tab it is read from", () => {
    const h = harness(null);
    h.setLayouts(new Map([["equities", withDocked("equities", ["jarvis-1"])]]));
    h.setDocked([placement("jarvis-1", "equities")]);

    h.kick();
    h.flush();

    const payload = parseWorkspaceLayout(h.stored());
    expect(payload?.tabs.equities?.docked).toEqual([
      { panelId: "jarvis-1", spec: SPEC },
    ]);
    expect(payload?.tabs.fx).toBeUndefined();
  });

  it("read-modify-write: a tab whose layout machine was never created survives verbatim", () => {
    const seeded: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        credit: {
          layout: withDocked("credit", ["jarvis-9"]),
          docked: [{ panelId: "jarvis-9", spec: SPEC }],
        },
      },
    };
    const h = harness(serializeWorkspaceLayout(seeded));
    // Only `fx` was ever touched this session.
    h.setLayouts(new Map([["fx", withDocked("fx", [])]]));

    h.kick();
    h.flush();

    const payload = parseWorkspaceLayout(h.stored());
    expect(payload?.tabs.credit).toEqual(seeded.tabs.credit);
    expect(payload?.tabs.fx?.docked).toEqual([]);
  });

  it("prunes a docked leaf the panels machine no longer knows (dismissed while docked) instead of writing an unreadable payload", () => {
    const h = harness(null);
    h.setLayouts(new Map([["fx", withDocked("fx", ["jarvis-1", "jarvis-2"])]]));
    // `jarvis-1` was dismissed while docked, so it is gone from the panels
    // machine while its leaf is still in the tree.
    h.setDocked([placement("jarvis-2", "fx")]);

    h.kick();
    h.flush();

    const payload = parseWorkspaceLayout(h.stored());
    expect(payload).not.toBeNull();
    expect(payload?.tabs.fx?.docked).toEqual([
      { panelId: "jarvis-2", spec: SPEC },
    ]);
    expect(
      dockedLeafIds(
        payload?.tabs.fx?.layout.root ??
          createDefaultLayoutPort("fx").initial.root,
        dockedLeafIds(createDefaultLayoutPort("fx").initial.root, []),
      ),
    ).toEqual(["jarvis-2"]);
  });

  it("clears a maximized/collapsed reference to a pruned leaf", () => {
    const h = harness(null);
    const base = withDocked("fx", ["jarvis-1"]);
    h.setLayouts(
      new Map([
        ["fx", { ...base, maximized: "jarvis-1", collapsed: ["jarvis-1"] }],
      ]),
    );
    h.setDocked([]);

    h.kick();
    h.flush();

    const payload = parseWorkspaceLayout(h.stored());
    expect(payload?.tabs.fx?.layout.maximized).toBeNull();
    expect(payload?.tabs.fx?.layout.collapsed).toEqual([]);
    expect(payload?.tabs.fx?.docked).toEqual([]);
  });

  it("drops a ghost placement whose leaf is not in the tab's tree", () => {
    const h = harness(null);
    h.setLayouts(new Map([["fx", withDocked("fx", [])]]));
    h.setDocked([placement("jarvis-ghost", "fx")]);

    h.kick();
    h.flush();

    const payload = parseWorkspaceLayout(h.stored());
    expect(payload?.tabs.fx?.docked).toEqual([]);
  });

  it("every write round-trips through the parser", () => {
    const h = harness(null);
    h.setLayouts(
      new Map([
        ["fx", withDocked("fx", ["jarvis-1"])],
        ["equities", withDocked("equities", ["jarvis-2"])],
      ]),
    );
    h.setDocked([
      placement("jarvis-1", "fx"),
      placement("jarvis-2", "equities"),
    ]);

    h.kick();
    h.flush();

    for (const raw of h.writes) {
      expect(parseWorkspaceLayout(raw)).not.toBeNull();
    }
  });
});

// The last line of defence, unreachable through `reconcileTabEntry` but
// pinned so a future refactor cannot turn it into a silent data-loss path:
// a payload the parser would reject is NOT written (the previously stored
// good value survives), and the skip announces itself once.
describe("createWorkspacePersistenceWriter — unwritable payload guard", () => {
  beforeEach(() => {
    resetUnwritablePayloadWarning();
  });

  it("keeps the stored value and warns once instead of writing a payload the parser rejects", () => {
    const good = serializeWorkspaceLayout({
      v: 1,
      tabs: { fx: { layout: withDocked("fx", []), docked: [] } },
    });
    const h = harness(good);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // silenced: the message is asserted, not printed
    });

    // `maximized` naming a panel that is in no tree at all — a corruption
    // reconciliation does not (and cannot) repair, since only pruned leaves
    // clear it.
    h.setLayouts(
      new Map([["fx", { ...withDocked("fx", []), maximized: "ghost-panel" }]]),
    );

    h.kick();
    h.flush();
    h.kick();
    h.flush();

    expect(h.writes).toEqual([]);
    expect(h.stored()).toBe(good);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

/** A tab's default tree with `panelIds` docked into it — the shape a layout
 * machine really holds after that many `insertPanel` intents. */
function withDocked(
  tab: WorkspaceTab,
  panelIds: readonly string[],
): LayoutState {
  const initial = createDefaultLayoutPort(tab).initial;
  const staticIds = dockedLeafIds(initial.root, []);
  let root = initial.root;

  for (const panelId of panelIds) {
    root = insertDockedLeaf(root, panelId, staticIds);
  }

  return { ...initial, root };
}

function placement(panelId: string, tab: WorkspaceTab): DockedPanelPlacement {
  return { panelId, spec: SPEC, tab };
}

interface Harness {
  readonly kick: () => void;
  readonly flush: () => void;
  readonly writes: readonly string[];
  readonly stored: () => string | null;
  readonly setLayouts: (next: ReadonlyMap<WorkspaceTab, LayoutState>) => void;
  readonly setDocked: (next: readonly DockedPanelPlacement[]) => void;
}

function harness(seed: string | null): Harness {
  const kick$ = new Subject<void>();
  const scheduler = new VirtualTimeScheduler();
  const writes: string[] = [];
  let stored = seed;
  let layouts: ReadonlyMap<WorkspaceTab, LayoutState> = new Map();
  let docked: readonly DockedPanelPlacement[] = [];

  createWorkspacePersistenceWriter({
    kick$,
    readStoredLayout: () => {
      return stored;
    },
    writeStoredLayout: (value: string) => {
      stored = value;
      writes.push(value);
    },
    createdLayouts: () => {
      return layouts;
    },
    dockedPanels: () => {
      return docked;
    },
    scheduler,
  });

  return {
    kick: () => {
      kick$.next();
    },
    flush: () => {
      scheduler.flush();
    },
    writes,
    stored: () => {
      return stored;
    },
    setLayouts: (next: ReadonlyMap<WorkspaceTab, LayoutState>) => {
      layouts = next;
    },
    setDocked: (next: readonly DockedPanelPlacement[]) => {
      docked = next;
    },
  };
}
