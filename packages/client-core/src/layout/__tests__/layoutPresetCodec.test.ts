import { describe, expect, it } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { WorkspaceTab } from "../defaultLayoutPort";
import { createDefaultLayoutPort } from "../defaultLayoutPort";
import { dockedLeafIds, insertDockedLeaf } from "../dockColumn";
import type {
  LayoutPresetEntry,
  StoredLayoutPreset,
} from "../layoutPresetCodec";
import {
  DEFAULT_LAYOUT_PRESET_NAME,
  LAYOUT_PRESET_VERSION,
  MAX_LAYOUT_PRESET_NAME_LENGTH,
  parseLayoutPresetList,
  serializeLayoutPresetList,
  summarizeLayoutPresets,
  UNREADABLE_LIST_ID,
  validateLayoutPresetName,
} from "../layoutPresetCodec";
import type { PersistedTabLayout } from "../workspaceLayoutPersistence";

describe("parseLayoutPresetList", () => {
  it("raw === null → an empty, readable list", () => {
    expect(parseLayoutPresetList("fx", null)).toEqual({
      wholeListUnreadable: false,
      entries: [],
    });
  });

  it("a raw string that isn't JSON → the whole-list-unreadable sentinel", () => {
    const parsed = parseLayoutPresetList("fx", "not json{");

    expect(parsed).toEqual({
      wholeListUnreadable: true,
      entries: [
        {
          readable: false,
          id: UNREADABLE_LIST_ID,
          name: "Unreadable saved layouts",
          raw: null,
        },
      ],
    });
  });

  it("JSON that parses but isn't an array → the whole-list-unreadable sentinel", () => {
    const parsed = parseLayoutPresetList(
      "fx",
      JSON.stringify({ not: "an array" }),
    );

    expect(parsed).toEqual({
      wholeListUnreadable: true,
      entries: [
        {
          readable: false,
          id: UNREADABLE_LIST_ID,
          name: "Unreadable saved layouts",
          raw: null,
        },
      ],
    });
  });

  it("round-trips a real default tab layout exactly, including initialPx holes", () => {
    const preset = createReadablePreset("fx");

    const parsed = parseLayoutPresetList("fx", JSON.stringify([preset]));

    expect(parsed).toEqual({
      wholeListUnreadable: false,
      entries: [{ readable: true, preset }],
    });
  });

  it("a non-object element is unreadable with an index-based id and generic name", () => {
    const parsed = parseLayoutPresetList(
      "fx",
      JSON.stringify(["not-a-record"]),
    );

    expect(parsed.entries).toEqual([
      {
        readable: false,
        id: "unreadable-0",
        name: "Unreadable layout",
        raw: "not-a-record",
      },
    ]);
  });

  it("an unreadable element with a string id and name keeps them", () => {
    const raw = { id: "custom-id", name: "Custom Name", v: 999 };

    const parsed = parseLayoutPresetList("fx", JSON.stringify([raw]));

    expect(parsed.entries).toEqual([
      { readable: false, id: "custom-id", name: "Custom Name", raw },
    ]);
  });

  it("an unknown version is unreadable", () => {
    const preset = { ...createReadablePreset("fx"), v: 2 };

    const parsed = parseLayoutPresetList("fx", JSON.stringify([preset]));

    expect(parsed.entries).toEqual([
      {
        readable: false,
        id: preset.id,
        name: preset.name,
        raw: asStoredJson(preset),
      },
    ]);
  });

  it.each(["id", "name", "savedAt", "blob"] as const)(
    "a non-string %s is unreadable",
    (field) => {
      const preset = { ...createReadablePreset("fx"), [field]: 123 };

      const parsed = parseLayoutPresetList("fx", JSON.stringify([preset]));

      expect(parsed.entries[0]?.readable).toBe(false);
    },
  );

  it("a layout that fails the workspace-persistence round trip is unreadable", () => {
    const preset = {
      ...createReadablePreset("fx"),
      layout: { layout: { root: { kind: "not-a-real-node" } }, docked: [] },
    };

    const parsed = parseLayoutPresetList("fx", JSON.stringify([preset]));

    expect(parsed.entries).toEqual([
      {
        readable: false,
        id: preset.id,
        name: preset.name,
        raw: asStoredJson(preset),
      },
    ]);
  });

  it("a layout with a non-empty docked list is unreadable (ruling P2), even though the tree/docked pair is otherwise fully reconciled", () => {
    const preset = {
      ...createReadablePreset("fx"),
      layout: createDockedTabLayout("fx", ["docked-1"]),
    };

    const parsed = parseLayoutPresetList("fx", JSON.stringify([preset]));

    expect(parsed.entries[0]?.readable).toBe(false);
  });

  it("duplicate ids: the first wins, the second becomes unreadable with a fresh id", () => {
    const preset = createReadablePreset("fx");

    const parsed = parseLayoutPresetList(
      "fx",
      JSON.stringify([preset, preset]),
    );

    expect(parsed.entries).toEqual([
      { readable: true, preset },
      {
        readable: false,
        id: "unreadable-1",
        name: preset.name,
        raw: asStoredJson(preset),
      },
    ]);
  });

  it("a preset record with no layout key at all is unreadable (JSON.stringify drops an undefined property, unlike an array hole)", () => {
    const record = createPresetRecordWithoutLayout("fx");

    const parsed = parseLayoutPresetList("fx", JSON.stringify([record]));

    expect(parsed.entries).toEqual([
      {
        readable: false,
        id: record.id,
        name: record.name,
        raw: record,
      },
    ]);
  });

  it("a fallback id that collides with an already-claimed id is uniquified further, never handed out unchecked", () => {
    // Both stored elements independently carry the SAME id, "unreadable-1"
    // — chosen so that index 1's naive fallback (`unreadable-${index}` ===
    // "unreadable-1") would ALSO equal the very id it's trying to avoid,
    // reproducing the collision class this test guards against.
    const first = { ...createReadablePreset("fx"), id: "unreadable-1" };
    const second = { ...createReadablePreset("fx"), id: "unreadable-1" };

    const parsed = parseLayoutPresetList("fx", JSON.stringify([first, second]));

    expect(parsed.entries).toEqual([
      { readable: true, preset: first },
      {
        readable: false,
        id: "unreadable-1-2",
        name: second.name,
        raw: asStoredJson(second),
      },
    ]);

    // The invariant the whole rule exists for: no two rows share one id.
    const ids = parsed.entries.map((entry) => {
      return entry.readable ? entry.preset.id : entry.id;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps three tabs' worth of presets independent by tab", () => {
    const fxPreset = createReadablePreset("fx");
    const creditPreset = createReadablePreset("credit");

    expect(
      parseLayoutPresetList("fx", JSON.stringify([fxPreset])).entries,
    ).toEqual([{ readable: true, preset: fxPreset }]);
    expect(
      parseLayoutPresetList("credit", JSON.stringify([creditPreset])).entries,
    ).toEqual([{ readable: true, preset: creditPreset }]);
  });
});

describe("serializeLayoutPresetList", () => {
  it("serializes a readable entry as its record and an unreadable one as its raw value", () => {
    const preset = createReadablePreset("fx");
    const entries: readonly LayoutPresetEntry[] = [
      { readable: true, preset },
      { readable: false, id: "bad-1", name: "Bad", raw: { weird: true } },
    ];

    const serialized = serializeLayoutPresetList(entries);

    expect(JSON.parse(serialized)).toEqual([
      asStoredJson(preset),
      { weird: true },
    ]);
  });

  it("round-trips through parseLayoutPresetList unchanged", () => {
    const preset = createReadablePreset("fx");
    const entries: readonly LayoutPresetEntry[] = [{ readable: true, preset }];

    const serialized = serializeLayoutPresetList(entries);

    expect(parseLayoutPresetList("fx", serialized)).toEqual({
      wholeListUnreadable: false,
      entries,
    });
  });

  it("drops the whole-list sentinel structurally, rather than re-emitting its null raw value", () => {
    // A caller that handed this sentinel straight back in (e.g. forgot the
    // `store-unreadable` special case) must NOT get "null" written over the
    // user's real unreadable stored string — the function protects the
    // invariant itself rather than relying on caller discipline.
    const sentinelEntries: readonly LayoutPresetEntry[] = [
      {
        readable: false,
        id: UNREADABLE_LIST_ID,
        name: "Unreadable saved layouts",
        raw: null,
      },
    ];

    expect(JSON.parse(serializeLayoutPresetList(sentinelEntries))).toEqual([]);
  });

  it("drops only the sentinel when it's mixed with genuinely unreadable entries, which still serialize", () => {
    const sentinel: LayoutPresetEntry = {
      readable: false,
      id: UNREADABLE_LIST_ID,
      name: "Unreadable saved layouts",
      raw: null,
    };

    const otherUnreadable: LayoutPresetEntry = {
      readable: false,
      id: "bad-1",
      name: "Bad",
      raw: { weird: true },
    };

    const serialized = serializeLayoutPresetList([sentinel, otherUnreadable]);

    expect(JSON.parse(serialized)).toEqual([{ weird: true }]);
  });
});

describe("summarizeLayoutPresets", () => {
  it("maps a readable entry to a summary with its own savedAt", () => {
    const preset = createReadablePreset("fx");

    const summary = summarizeLayoutPresets({
      wholeListUnreadable: false,
      entries: [{ readable: true, preset }],
    });

    expect(summary).toEqual([
      {
        id: preset.id,
        name: preset.name,
        savedAt: preset.savedAt,
        readable: true,
      },
    ]);
  });

  it("maps an unreadable entry to a summary with a null savedAt", () => {
    const summary = summarizeLayoutPresets({
      wholeListUnreadable: true,
      entries: [
        {
          readable: false,
          id: UNREADABLE_LIST_ID,
          name: "Unreadable saved layouts",
          raw: null,
        },
      ],
    });

    expect(summary).toEqual([
      {
        id: UNREADABLE_LIST_ID,
        name: "Unreadable saved layouts",
        savedAt: null,
        readable: false,
      },
    ]);
  });
});

describe("validateLayoutPresetName", () => {
  it("rejects a whitespace-only name as empty", () => {
    expect(validateLayoutPresetName("  ")).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("rejects the empty string as empty", () => {
    expect(validateLayoutPresetName("")).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("rejects a name over 40 chars as too-long", () => {
    expect(
      validateLayoutPresetName("a".repeat(MAX_LAYOUT_PRESET_NAME_LENGTH + 1)),
    ).toEqual({ ok: false, problem: "too-long" });
  });

  it("accepts a name exactly at the 40-char limit", () => {
    const name = "a".repeat(MAX_LAYOUT_PRESET_NAME_LENGTH);

    expect(validateLayoutPresetName(name)).toEqual({ ok: true, name });
  });

  it("rejects the reserved name case-insensitively", () => {
    expect(validateLayoutPresetName("DEFAULT")).toEqual({
      ok: false,
      problem: "reserved",
    });
    expect(validateLayoutPresetName(DEFAULT_LAYOUT_PRESET_NAME)).toEqual({
      ok: false,
      problem: "reserved",
    });
  });

  it("trims a valid name", () => {
    expect(validateLayoutPresetName("  Morning  ")).toEqual({
      ok: true,
      name: "Morning",
    });
  });
});

/** The parsed JSON value a stored preset round-trips to before the codec's
 * own reconstruction pass — nested `undefined` array holes (`initialPx`)
 * come back as `null`, exactly like the real store. Used to build
 * expectations for the `raw` field of an UNREADABLE entry, which holds the
 * parsed element as-is, never the reconstructed value. */
function asStoredJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function createTabLayout(tab: WorkspaceTab): PersistedTabLayout {
  return { layout: createDefaultLayoutPort(tab).initial, docked: [] };
}

/** A tree/docked pair that `workspaceLayoutPersistence`'s own validator
 * accepts on its own terms (mirrors `syntheticDockedTab` in
 * `workspaceLayoutPersistence.test.ts`) — used to prove that the codec's
 * `docked.length === 0` rule (ruling P2) is an ADDITIONAL rejection on top
 * of that validator, not a restatement of something it already rejects. */
function createDockedTabLayout(
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
      return { panelId, spec: VALID_PANEL_SPEC };
    }),
  };
}

const VALID_PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

function createReadablePreset(tab: WorkspaceTab): StoredLayoutPreset {
  return {
    v: LAYOUT_PRESET_VERSION,
    id: `preset-${tab}`,
    name: "Morning",
    savedAt: "2026-09-20T00:00:00.000Z",
    blob: JSON.stringify({ grid: { tab } }),
    layout: createTabLayout(tab),
  };
}

/** A record with every readable-preset field EXCEPT `layout` — never simply
 * an otherwise-readable preset with `layout: undefined`, because
 * `JSON.stringify` drops an object property whose value is `undefined`
 * entirely (unlike an `undefined` ARRAY element, which becomes `null`; see
 * the module doc). This is the absent-key shape the wire actually produces,
 * distinct from a present-but-wrong-typed `layout`. */
function createPresetRecordWithoutLayout(
  tab: WorkspaceTab,
): Record<string, unknown> {
  const preset = createReadablePreset(tab);

  return {
    v: preset.v,
    id: preset.id,
    name: preset.name,
    savedAt: preset.savedAt,
    blob: preset.blob,
  };
}
