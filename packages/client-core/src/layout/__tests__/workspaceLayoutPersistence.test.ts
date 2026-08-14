import { describe, expect, it } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { WorkspaceTab } from "../defaultLayoutPort";
import { createDefaultLayoutPort } from "../defaultLayoutPort";
import { dockedLeafIds, insertDockedLeaf } from "../dockColumn";
import type { LayoutState } from "../layoutPort";
import type {
  PersistedTabLayout,
  WorkspaceLayoutV1,
} from "../workspaceLayoutPersistence";
import {
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
} from "../workspaceLayoutPersistence";

const REAL_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "admin",
  "equities",
];

const VALID_SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

describe("serializeWorkspaceLayout / parseWorkspaceLayout — round trip", () => {
  it.each(REAL_TABS)(
    "round-trips the real default tree for %s plus a docked entry",
    (tab) => {
      const payload: WorkspaceLayoutV1 = {
        v: 1,
        tabs: { [tab]: tabLayoutFor(tab) },
      };

      const raw = serializeWorkspaceLayout(payload);
      expect(parseWorkspaceLayout(raw)).toEqual(payload);
    },
  );

  it("round-trips all four tabs together, each with a docked entry", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: Object.fromEntries(
        REAL_TABS.map((tab) => {
          return [tab, tabLayoutFor(tab)];
        }),
      ),
    };

    const raw = serializeWorkspaceLayout(payload);
    expect(parseWorkspaceLayout(raw)).toEqual(payload);
  });

  it("round-trips an empty tabs map", () => {
    const payload: WorkspaceLayoutV1 = { v: 1, tabs: {} };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toEqual(
      payload,
    );
  });

  it("round-trips a tab layout with no docked entries", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: { layout: createDefaultLayoutPort("fx").initial, docked: [] },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toEqual(
      payload,
    );
  });

  it("round-trips a split node carrying fixedPx (distinct call site from initialPx)", () => {
    const layout: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        // "fx-rates" is a static fx leaf (not foreign, needs no docked
        // entry); "docked-fixed" is the one foreign leaf, matched below.
        children: [
          { kind: "panel", panelId: "fx-rates" },
          { kind: "panel", panelId: "docked-fixed" },
        ],
        sizes: [0.6, 0.4],
        fixedPx: [120, undefined],
      },
      maximized: null,
      collapsed: [],
    };

    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: { layout, docked: [{ panelId: "docked-fixed", spec: VALID_SPEC }] },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toEqual(
      payload,
    );
  });
});

describe("parseWorkspaceLayout — null input", () => {
  it("returns null for a null raw value", () => {
    expect(parseWorkspaceLayout(null)).toBeNull();
  });
});

describe("parseWorkspaceLayout — fail-closed on a pathologically deep tree", () => {
  it("returns null instead of throwing on ~20k nested single-child splits", () => {
    const DEPTH = 20_000;
    let nodeJson = '{"kind":"panel","panelId":"leaf"}';

    for (let i = 0; i < DEPTH; i += 1) {
      nodeJson = `{"kind":"split","dir":"column","children":[${nodeJson}],"sizes":[1]}`;
    }

    const raw = `{"v":1,"tabs":{"fx":{"layout":{"root":${nodeJson},"maximized":null,"collapsed":[]},"docked":[]}}}`;

    expect(() => {
      parseWorkspaceLayout(raw);
    }).not.toThrow();
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });
});

describe("parseWorkspaceLayout — tree/docked reconciliation", () => {
  it("rejects an orphan leaf: a foreign tree leaf with no docked entry", () => {
    const staticIds = dockedLeafIds(
      createDefaultLayoutPort("fx").initial.root,
      [],
    );

    const root = insertDockedLeaf(
      createDefaultLayoutPort("fx").initial.root,
      "orphan-1",
      staticIds,
    );

    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: { layout: { root, maximized: null, collapsed: [] }, docked: [] },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });

  it("rejects a ghost docked entry: a docked entry with no matching tree leaf", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: {
          layout: createDefaultLayoutPort("fx").initial,
          docked: [{ panelId: "ghost-1", spec: VALID_SPEC }],
        },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });

  it("rejects a duplicate docked panelId", () => {
    const base = syntheticDockedTab("fx", ["docked-1"]);
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: {
          layout: base.layout,
          docked: [
            { panelId: "docked-1", spec: VALID_SPEC },
            { panelId: "docked-1", spec: VALID_SPEC },
          ],
        },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });

  it("rejects 5 fully-reconciled docked entries in one tab (exceeds the global cap of 4)", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: { fx: syntheticDockedTab("fx", ["d1", "d2", "d3", "d4", "d5"]) },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });

  it("rejects 2 docked entries each across three tabs (each tab individually reconciles, but the GLOBAL total of 6 exceeds the cap of 4)", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: syntheticDockedTab("fx", ["d1", "d2"]),
        credit: syntheticDockedTab("credit", ["d3", "d4"]),
        equities: syntheticDockedTab("equities", ["d5", "d6"]),
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });
});

describe("parseWorkspaceLayout — maximized/collapsed membership", () => {
  it("rejects a maximized id that names no leaf in the tree", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: {
          layout: {
            ...createDefaultLayoutPort("fx").initial,
            maximized: "not-a-real-panel",
          },
          docked: [],
        },
      },
    };
    expect(parseWorkspaceLayout(serializeWorkspaceLayout(payload))).toBeNull();
  });

  it("accepts collapsed with a ghost id, filtering it rather than rejecting the payload", () => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: {
        fx: {
          layout: {
            ...createDefaultLayoutPort("fx").initial,
            collapsed: ["fx-rates", "ghost-id"],
          },
          docked: [],
        },
      },
    };
    const parsed = parseWorkspaceLayout(serializeWorkspaceLayout(payload));
    expect(parsed).not.toBeNull();
    expect(parsed?.tabs.fx?.layout.collapsed).toEqual(["fx-rates"]);
  });
});

describe("parseWorkspaceLayout — corrupt corpus, every case → null", () => {
  it("truncated JSON", () => {
    const raw = serializeWorkspaceLayout(noDockedPayload());
    expect(parseWorkspaceLayout(raw.slice(0, raw.length - 10))).toBeNull();
  });

  it("not JSON at all", () => {
    expect(parseWorkspaceLayout("not json{{{")).toBeNull();
  });

  it("top-level JSON is the literal null", () => {
    expect(parseWorkspaceLayout("null")).toBeNull();
  });

  it("top-level is not an object (a bare array)", () => {
    expect(parseWorkspaceLayout(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it("top-level is not an object (a bare string)", () => {
    expect(parseWorkspaceLayout(JSON.stringify("hello"))).toBeNull();
  });

  it("v: 2 instead of 1", () => {
    const raw = corruptedJson((obj) => {
      obj.v = 2;
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("unknown tab key", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.bogusTab = obj.tabs.fx;
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("tabs is not a record", () => {
    const raw = corruptedJson((obj) => {
      return { ...obj, tabs: "not-a-record" };
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a tab entry is missing layout entirely", () => {
    const raw = corruptedJson((obj) => {
      return { ...obj, tabs: { ...obj.tabs, fx: { docked: [] } } };
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's sizes contains a value ≤ 0 that still sums to 1 (isolates the ≤0 bound from the >1 bound)", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.sizes = [0, 1];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's sizes contains a negative number and a >1 number", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.sizes = [-0.5, 1.5];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's sizes do not sum to 1", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.sizes = [0.1, 0.1];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's sizes length mismatches children length", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.sizes = [1];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's children is not an array", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.children = "not-an-array";
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a leaf's panelId is not a string", () => {
    const raw = corruptedJson((obj) => {
      const topChildren = obj.tabs.fx.layout.root.children as RawNode[];
      const leftColumnChildren = topChildren[0].children as RawNode[];
      leftColumnChildren[0].panelId = 123;
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a node's kind is neither split nor panel", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.kind = "bogus";
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a split node's dir is neither row nor column", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.dir = "diagonal";
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("maximized is a number instead of string | null", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.maximized = 42;
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("collapsed contains a non-string entry", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.collapsed = [1, 2];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("docked is not an array", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.docked = "not-an-array";
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a docked entry is not an object", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.docked = ["not-an-object"];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a docked entry's panelId is empty", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.docked = [{ panelId: "", spec: VALID_SPEC }];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("a docked entry's spec fails parsePanelSpec (missing required field)", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.docked = [
        { panelId: "docked-1", spec: { v: 1, title: "no source or viz" } },
      ];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("fixedPx array length mismatches children length", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.fixedPx = [1, 2, 3];
      return obj;
    });
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });

  it("initialPx contains a non-finite entry (1e400 overflows to Infinity)", () => {
    // Built by direct text substitution, not JSON.stringify(Infinity)
    // (which serializes to `null` — indistinguishable from a legitimate
    // wire hole) — `1e400` is syntactically a normal JSON number token
    // that overflows to `Infinity` once parsed, which is the actual
    // non-finite-entry case `isFiniteNumber` must reject.
    const raw = serializeWorkspaceLayout(noDockedPayload()).replace(
      '"initialPx":[null,360]',
      '"initialPx":[1e400,360]',
    );
    expect(raw).toContain("1e400");
    expect(parseWorkspaceLayout(raw)).toBeNull();
  });
});

/** Minimal shape of a JSON-round-tripped `WorkspaceLayoutV1`, with every
 * field the corrupt-corpus tests above poke at widened to `unknown` — these
 * fixtures exist purely to build structurally-invalid payloads, so the
 * point is to accept an arbitrary replacement value at each site rather
 * than to model the valid shape a second time (that's `WorkspaceLayoutV1`
 * itself, asserted by the round-trip tests above). */
interface RawNode {
  kind: unknown;
  dir?: unknown;
  panelId?: unknown;
  children?: unknown;
  sizes?: unknown;
  fixedPx?: unknown;
  initialPx?: unknown;
}
interface RawLayout {
  root: RawNode;
  maximized: unknown;
  collapsed: unknown;
}
interface RawTab {
  layout: RawLayout;
  docked: unknown;
}
interface RawPayload {
  v: unknown;
  tabs: Record<string, RawTab>;
}

/** Builds a tab whose tree and `docked` array are mutually reconciled: for
 * each id in `panelIds`, a foreign leaf is inserted into `tab`'s default
 * tree (via the same `insertDockedLeaf` the real app uses) AND a matching
 * `docked` entry is added — so it passes `isReconciledWithTree` and can be
 * combined with siblings to build cap-related corpus cases without also
 * tripping the reconciliation check by accident. */
function syntheticDockedTab(
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
      return { panelId, spec: VALID_SPEC };
    }),
  };
}

function tabLayoutFor(tab: WorkspaceTab): PersistedTabLayout {
  return syntheticDockedTab(tab, ["docked-1"]);
}

function noDockedPayload(): WorkspaceLayoutV1 {
  return {
    v: 1,
    tabs: { fx: { layout: createDefaultLayoutPort("fx").initial, docked: [] } },
  };
}

/** Serializes `noDockedPayload()`, JSON round-trips it back into a mutable
 * `RawPayload`, lets `mutate` corrupt one field in place, then
 * re-serializes — every corrupt-corpus test above is "take a payload that
 * would otherwise round-trip cleanly, break exactly one thing about it,
 * assert the whole parse still fails". Deliberately built on the
 * NO-docked fixture: these tests target structural rules unrelated to
 * tree/docked reconciliation, so keeping `docked: []` means the tree's
 * shape (and its children count/leaf ids) never has to account for an
 * inserted dock column, keeping every mutation's target shape predictable. */
function corruptedJson(mutate: (payload: RawPayload) => unknown): string {
  const parsed = JSON.parse(
    serializeWorkspaceLayout(noDockedPayload()),
  ) as RawPayload;
  return JSON.stringify(mutate(parsed));
}
