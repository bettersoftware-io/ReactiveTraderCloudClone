import { describe, expect, it } from "vitest";

import {
  CANDLE_TIMEFRAMES,
  type CandleTimeframe,
  POWER_SAVER_LEVELS,
  type PowerSaverLevel,
  THEME_SKINS,
  type ThemeSkin,
} from "@rtc/domain";

import {
  DRIVE_CHART_TYPES,
  DRIVE_COMMAND_JSON_SCHEMA,
  DRIVE_COMMAND_KINDS,
  DRIVE_INDICATORS,
  DRIVE_LAYOUT_OPS,
  DRIVE_PANES,
  DRIVE_POWER_LEVELS,
  DRIVE_SKINS,
  DRIVE_TABS,
  DRIVE_TIMEFRAMES,
  MAX_DRIVE_COMMANDS,
  parseDriveBatch,
} from "../driveCommand.js";

describe("parseDriveBatch — one valid batch per kind", () => {
  it("accepts switchTab", () => {
    const batch = { v: 1, commands: [{ kind: "switchTab", tab: "credit" }] };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts layout", () => {
    const batch = {
      v: 1,
      commands: [
        { kind: "layout", op: "maximize", tab: "fx", panelId: "blotter" },
      ],
    };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts eqSelect", () => {
    const batch = { v: 1, commands: [{ kind: "eqSelect", symbol: "AAPL" }] };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts eqTimeframe", () => {
    const batch = { v: 1, commands: [{ kind: "eqTimeframe", tf: "1W" }] };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts eqChartType", () => {
    const batch = { v: 1, commands: [{ kind: "eqChartType", chart: "line" }] };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts eqIndicator", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqIndicator", id: "sma20", on: true }],
    };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts eqPane", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqPane", id: "rsi", on: false }],
    };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts setTheme", () => {
    const batch = { v: 1, commands: [{ kind: "setTheme", skin: "holo3d" }] };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts setPowerSaver", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "setPowerSaver", level: "calm" }],
    };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });

  it("accepts dismissPanel", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "dismissPanel", panelId: "analytics" }],
    };
    expect(parseDriveBatch(batch)).toEqual({ ok: true, batch });
  });
});

describe("parseDriveBatch — command count bounds", () => {
  function switchTab(): Record<string, unknown> {
    return { kind: "switchTab", tab: "fx" };
  }

  it("accepts exactly 1 command (the minimum)", () => {
    const batch = { v: 1, commands: [switchTab()] };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });

  it("accepts exactly 8 commands (the maximum)", () => {
    const batch = { v: 1, commands: Array(8).fill(switchTab()) };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });

  it("rejects 0 commands with the exact error", () => {
    const batch = { v: 1, commands: [] };
    expect(parseDriveBatch(batch)).toEqual({
      ok: false,
      error: "commands: must contain 1..8 commands",
    });
  });

  it("rejects 9 commands with the exact error", () => {
    const batch = { v: 1, commands: Array(9).fill(switchTab()) };
    expect(parseDriveBatch(batch)).toEqual({
      ok: false,
      error: "commands: must contain 1..8 commands",
    });
  });

  it("MAX_DRIVE_COMMANDS is 8", () => {
    expect(MAX_DRIVE_COMMANDS).toBe(8);
  });
});

describe("parseDriveBatch — root shape", () => {
  it("rejects a non-object input", () => {
    const result = parseDriveBatch("not an object");
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("batch:"),
    });
  });

  it("rejects null", () => {
    expect(parseDriveBatch(null).ok).toBe(false);
  });

  it("rejects a wrong v", () => {
    const batch = {
      v: 2,
      commands: [{ kind: "switchTab", tab: "fx" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("v:"),
    });
  });

  it("rejects a missing v", () => {
    const batch = { commands: [{ kind: "switchTab", tab: "fx" }] };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("tolerates unknown top-level keys — ignores rather than rejects", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "switchTab", tab: "fx" }],
      unexpectedExtra: "whatever",
    };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });
});

describe("parseDriveBatch — commands array shape", () => {
  it("rejects a non-array commands", () => {
    const batch = { v: 1, commands: "nope" };
    expect(parseDriveBatch(batch)).toEqual({
      ok: false,
      error: "commands: must contain 1..8 commands",
    });
  });

  it("rejects a non-object command entry", () => {
    const batch = { v: 1, commands: [42] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0]:"),
    });
  });

  it("rejects an unknown kind with the exact error, indexed correctly", () => {
    const batch = {
      v: 1,
      commands: [
        { kind: "switchTab", tab: "fx" },
        { kind: "switchTab", tab: "credit" },
        { kind: "foo" },
      ],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: 'commands[2].kind: unknown kind "foo"',
    });
  });
});

describe("parseDriveBatch — per-variant field validation", () => {
  it("switchTab: rejects a missing tab", () => {
    const batch = { v: 1, commands: [{ kind: "switchTab" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].tab:"),
    });
  });

  it("switchTab: rejects an unknown tab value", () => {
    const batch = { v: 1, commands: [{ kind: "switchTab", tab: "nope" }] };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("layout: rejects a missing op", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "layout", tab: "fx", panelId: "blotter" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].op:"),
    });
  });

  it("layout: rejects a missing tab", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "layout", op: "maximize", panelId: "blotter" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].tab:"),
    });
  });

  it("layout: rejects a missing panelId", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "layout", op: "maximize", tab: "fx" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].panelId:"),
    });
  });

  it("layout: rejects an unknown op value", () => {
    const batch = {
      v: 1,
      commands: [
        { kind: "layout", op: "explode", tab: "fx", panelId: "blotter" },
      ],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqSelect: rejects a missing symbol", () => {
    const batch = { v: 1, commands: [{ kind: "eqSelect" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].symbol:"),
    });
  });

  it("eqSelect: rejects a non-string symbol", () => {
    const batch = { v: 1, commands: [{ kind: "eqSelect", symbol: 42 }] };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqSelect: rejects an empty symbol", () => {
    const batch = { v: 1, commands: [{ kind: "eqSelect", symbol: "" }] };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqSelect: rejects a symbol over 64 chars", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqSelect", symbol: "x".repeat(65) }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqSelect: accepts a symbol at exactly 64 chars (the maximum)", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqSelect", symbol: "x".repeat(64) }],
    };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });

  it("eqSelect: accepts a symbol at exactly 1 char (the minimum)", () => {
    const batch = { v: 1, commands: [{ kind: "eqSelect", symbol: "x" }] };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });

  it("eqSelect: accepts a symbol not on any known roster (membership not checked here)", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqSelect", symbol: "ZZZZNOTREAL" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });

  it("eqTimeframe: rejects a missing tf", () => {
    const batch = { v: 1, commands: [{ kind: "eqTimeframe" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].tf:"),
    });
  });

  it("eqTimeframe: rejects an unknown tf value", () => {
    const batch = { v: 1, commands: [{ kind: "eqTimeframe", tf: "1Y" }] };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqChartType: rejects a missing chart", () => {
    const batch = { v: 1, commands: [{ kind: "eqChartType" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].chart:"),
    });
  });

  it("eqChartType: rejects an unknown chart value", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqChartType", chart: "bar" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqIndicator: rejects a missing id", () => {
    const batch = { v: 1, commands: [{ kind: "eqIndicator", on: true }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].id:"),
    });
  });

  it("eqIndicator: rejects a missing on", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqIndicator", id: "sma20" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].on:"),
    });
  });

  it("eqIndicator: rejects a non-boolean on", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqIndicator", id: "sma20", on: "yes" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqIndicator: rejects an id from the eqPane set (id spaces are not merged)", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqIndicator", id: "rsi", on: true }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("eqPane: rejects a missing id", () => {
    const batch = { v: 1, commands: [{ kind: "eqPane", on: true }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].id:"),
    });
  });

  it("eqPane: rejects a missing on", () => {
    const batch = { v: 1, commands: [{ kind: "eqPane", id: "rsi" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].on:"),
    });
  });

  it("eqPane: rejects an id from the eqIndicator set (id spaces are not merged)", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "eqPane", id: "sma20", on: true }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("setTheme: rejects a missing skin", () => {
    const batch = { v: 1, commands: [{ kind: "setTheme" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].skin:"),
    });
  });

  it("setTheme: rejects an unknown skin value", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "setTheme", skin: "matrix" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("setPowerSaver: rejects a missing level", () => {
    const batch = { v: 1, commands: [{ kind: "setPowerSaver" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].level:"),
    });
  });

  it("setPowerSaver: rejects an unknown level value", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "setPowerSaver", level: "turbo" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("dismissPanel: rejects a missing panelId", () => {
    const batch = { v: 1, commands: [{ kind: "dismissPanel" }] };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("commands[0].panelId:"),
    });
  });

  it("dismissPanel: rejects an empty panelId", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "dismissPanel", panelId: "" }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("dismissPanel: rejects a panelId over 64 chars", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "dismissPanel", panelId: "x".repeat(65) }],
    };
    expect(parseDriveBatch(batch).ok).toBe(false);
  });

  it("dismissPanel: accepts a panelId at exactly 64 chars (the maximum)", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "dismissPanel", panelId: "x".repeat(64) }],
    };
    expect(parseDriveBatch(batch).ok).toBe(true);
  });
});

describe("parseDriveBatch — extra fields are stripped, not rejected", () => {
  it("strips an unknown extra field on a command, pinning the normalized output", () => {
    const batch = {
      v: 1,
      commands: [{ kind: "switchTab", tab: "fx", bogus: "whatever" }],
    };
    const result = parseDriveBatch(batch);
    expect(result).toEqual({
      ok: true,
      batch: { v: 1, commands: [{ kind: "switchTab", tab: "fx" }] },
    });
  });
});

describe("DRIVE_TIMEFRAMES — pinned against @rtc/domain CandleTimeframe", () => {
  it("deep-equals the fixed literal set", () => {
    expect(DRIVE_TIMEFRAMES).toEqual(["1D", "1W", "1M", "3M"]);
  });

  it("matches the values a CandleTimeframe can take (compile-time pin — fails to typecheck, not to run, if DRIVE_TIMEFRAMES has a value CandleTimeframe lacks)", () => {
    const _pin: readonly CandleTimeframe[] =
      DRIVE_TIMEFRAMES satisfies readonly CandleTimeframe[];
    expect(_pin).toBe(DRIVE_TIMEFRAMES);
  });

  it("deep-equals the live @rtc/domain CANDLE_TIMEFRAMES export (bidirectional — catches domain growing a member this list lacks)", () => {
    expect([...DRIVE_TIMEFRAMES]).toEqual([...CANDLE_TIMEFRAMES]);
  });
});

describe("DRIVE_SKINS — pinned against @rtc/domain ThemeSkin", () => {
  it("deep-equals the fixed literal set", () => {
    expect(DRIVE_SKINS).toEqual([
      "classic",
      "holo",
      "holo3d",
      "terminal",
      "terminal3d",
      "neon",
    ]);
  });

  it("matches the values a ThemeSkin can take (compile-time pin — fails to typecheck, not to run, if DRIVE_SKINS has a value ThemeSkin lacks)", () => {
    const _pin: readonly ThemeSkin[] =
      DRIVE_SKINS satisfies readonly ThemeSkin[];
    expect(_pin).toBe(DRIVE_SKINS);
  });

  it("deep-equals the live @rtc/domain THEME_SKINS export (bidirectional — catches domain growing a member this list lacks)", () => {
    expect([...DRIVE_SKINS]).toEqual([...THEME_SKINS]);
  });
});

describe("DRIVE_POWER_LEVELS — pinned against @rtc/domain PowerSaverLevel", () => {
  it("deep-equals the fixed literal set", () => {
    expect(DRIVE_POWER_LEVELS).toEqual(["off", "calm", "freeze"]);
  });

  it("matches the values a PowerSaverLevel can take (compile-time pin — fails to typecheck, not to run, if DRIVE_POWER_LEVELS has a value PowerSaverLevel lacks)", () => {
    const _pin: readonly PowerSaverLevel[] =
      DRIVE_POWER_LEVELS satisfies readonly PowerSaverLevel[];
    expect(_pin).toBe(DRIVE_POWER_LEVELS);
  });

  it("deep-equals the live @rtc/domain POWER_SAVER_LEVELS export (bidirectional — catches domain growing a member this list lacks)", () => {
    expect([...DRIVE_POWER_LEVELS]).toEqual([...POWER_SAVER_LEVELS]);
  });
});

describe("DRIVE_COMMAND_JSON_SCHEMA — derived from the same const arrays as the validator", () => {
  function itemBranches(): readonly Record<string, unknown>[] {
    const schema =
      DRIVE_COMMAND_JSON_SCHEMA as unknown as DriveCommandSchemaRoot;
    return schema.properties.commands.items.anyOf;
  }

  function branchFor(kind: string): Record<string, unknown> {
    const branch = itemBranches().find((candidate) => {
      const props = candidate.properties as KindConstProperty;
      return props.kind.const === kind;
    });

    if (branch === undefined) {
      throw new Error(`no schema branch for kind ${kind}`);
    }

    return branch;
  }

  function enumOf(branch: Record<string, unknown>, field: string): unknown {
    const props = branch.properties as Record<string, EnumProperty>;
    return props[field]?.enum;
  }

  it("has one anyOf branch per DRIVE_COMMAND_KINDS entry", () => {
    const kinds = itemBranches().map((branch) => {
      return (branch.properties as KindConstProperty).kind.const;
    });
    expect(kinds).toEqual([...DRIVE_COMMAND_KINDS]);
  });

  it("switchTab.tab and layout.tab enums match DRIVE_TABS verbatim", () => {
    expect(enumOf(branchFor("switchTab"), "tab")).toEqual([...DRIVE_TABS]);
    expect(enumOf(branchFor("layout"), "tab")).toEqual([...DRIVE_TABS]);
  });

  it("layout.op enum matches DRIVE_LAYOUT_OPS verbatim", () => {
    expect(enumOf(branchFor("layout"), "op")).toEqual([...DRIVE_LAYOUT_OPS]);
  });

  it("eqTimeframe.tf enum matches DRIVE_TIMEFRAMES verbatim", () => {
    expect(enumOf(branchFor("eqTimeframe"), "tf")).toEqual([
      ...DRIVE_TIMEFRAMES,
    ]);
  });

  it("eqChartType.chart enum matches DRIVE_CHART_TYPES verbatim", () => {
    expect(enumOf(branchFor("eqChartType"), "chart")).toEqual([
      ...DRIVE_CHART_TYPES,
    ]);
  });

  it("eqIndicator.id enum matches DRIVE_INDICATORS verbatim", () => {
    expect(enumOf(branchFor("eqIndicator"), "id")).toEqual([
      ...DRIVE_INDICATORS,
    ]);
  });

  it("eqPane.id enum matches DRIVE_PANES verbatim", () => {
    expect(enumOf(branchFor("eqPane"), "id")).toEqual([...DRIVE_PANES]);
  });

  it("setTheme.skin enum matches DRIVE_SKINS verbatim", () => {
    expect(enumOf(branchFor("setTheme"), "skin")).toEqual([...DRIVE_SKINS]);
  });

  it("setPowerSaver.level enum matches DRIVE_POWER_LEVELS verbatim", () => {
    expect(enumOf(branchFor("setPowerSaver"), "level")).toEqual([
      ...DRIVE_POWER_LEVELS,
    ]);
  });
});

/** `DRIVE_COMMAND_JSON_SCHEMA`'s own shape, as cast to reach its per-kind
 * `anyOf` branches. */
interface DriveCommandSchemaRoot {
  properties: {
    commands: { items: { anyOf: readonly Record<string, unknown>[] } };
  };
}

/** A schema branch's `kind` property, as cast to read its `const` value. */
interface KindConstProperty {
  kind: { const: string };
}

/** A schema branch's `properties`, as cast to read one field's `enum`. */
interface EnumProperty {
  enum?: readonly string[];
}
