import { describe, expect, it } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { WorkspaceTab } from "../defaultLayoutPort";
import { createDefaultLayoutPort } from "../defaultLayoutPort";
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
  it.each(
    REAL_TABS,
  )("round-trips the real default tree for %s plus a docked entry", (tab) => {
    const payload: WorkspaceLayoutV1 = {
      v: 1,
      tabs: { [tab]: tabLayoutFor(tab) },
    };

    const raw = serializeWorkspaceLayout(payload);
    expect(parseWorkspaceLayout(raw)).toEqual(payload);
  });

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
});

describe("parseWorkspaceLayout — null input", () => {
  it("returns null for a null raw value", () => {
    expect(parseWorkspaceLayout(null)).toBeNull();
  });
});

describe("parseWorkspaceLayout — corrupt corpus, every case → null", () => {
  it("truncated JSON", () => {
    const raw = serializeWorkspaceLayout({
      v: 1,
      tabs: { fx: tabLayoutFor("fx") },
    });
    expect(parseWorkspaceLayout(raw.slice(0, raw.length - 10))).toBeNull();
  });

  it("not JSON at all", () => {
    expect(parseWorkspaceLayout("not json{{{")).toBeNull();
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

  it("a split node's sizes contains a negative number", () => {
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

  it("a node's kind is neither split nor panel", () => {
    const raw = corruptedJson((obj) => {
      obj.tabs.fx.layout.root.kind = "bogus";
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
});

/** Minimal shape of a JSON-round-tripped `WorkspaceLayoutV1`, with every
 * field the corrupt-corpus tests below poke at widened to `unknown` — these
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

function tabLayoutFor(tab: WorkspaceTab): PersistedTabLayout {
  return {
    layout: createDefaultLayoutPort(tab).initial,
    docked: [{ panelId: "docked-1", spec: VALID_SPEC }],
  };
}

/** Serializes a valid single-tab (`fx`) payload, JSON round-trips it back
 * into a mutable `RawPayload`, lets `mutate` corrupt one field in place,
 * then re-serializes — every corrupt-corpus test below is "take a payload
 * that would otherwise round-trip cleanly, break exactly one thing about
 * it, assert the whole parse still fails". */
function corruptedJson(mutate: (payload: RawPayload) => unknown): string {
  const valid: WorkspaceLayoutV1 = { v: 1, tabs: { fx: tabLayoutFor("fx") } };
  const parsed = JSON.parse(serializeWorkspaceLayout(valid)) as RawPayload;
  return JSON.stringify(mutate(parsed));
}
