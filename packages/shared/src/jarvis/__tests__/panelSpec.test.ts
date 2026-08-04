import { describe, expect, it } from "vitest";

import {
  PANEL_ANNOTATION_KINDS,
  PANEL_ANNOTATION_TONES,
  PANEL_SOURCE_KINDS,
  PANEL_SPEC_JSON_SCHEMA,
  PANEL_TOPN_BY_VALUES,
  PANEL_TRANSFORM_KINDS,
  PANEL_VIZ_KINDS,
  parsePanelSpec,
} from "../panelSpec.js";

const knownSymbols = ["EURUSD", "GBPUSD", "USDJPY"];

describe("parsePanelSpec — valid input", () => {
  it("accepts a minimal valid spec (fxTicks + line)", () => {
    const result = parsePanelSpec(minimalValidSpec(), knownSymbols);
    expect(result).toEqual({ ok: true, spec: minimalValidSpec() });
  });

  it("accepts an analytics source with no symbols field", () => {
    const spec = {
      v: 1,
      title: "P&L overview",
      source: { kind: "analytics" },
      transforms: [],
      viz: { kind: "table" },
    };
    expect(parsePanelSpec(spec, knownSymbols)).toEqual({ ok: true, spec });
  });

  it("accepts a blotter source with no symbols field", () => {
    const spec = {
      v: 1,
      title: "Recent trades",
      source: { kind: "blotter" },
      transforms: [],
      viz: { kind: "table" },
    };
    expect(parsePanelSpec(spec, knownSymbols)).toEqual({ ok: true, spec });
  });

  it("accepts optional rationale, up to 4 transforms, up to 4 annotations", () => {
    const spec = {
      v: 1,
      title: "EURUSD analysis",
      rationale: "User asked how EURUSD has been trending lately.",
      source: { kind: "priceHistory", symbols: ["EURUSD"] },
      transforms: [
        { kind: "window", seconds: 60 },
        { kind: "returns" },
        { kind: "rollingVol", samples: 20 },
        { kind: "topN", n: 3, by: "change" },
      ],
      viz: { kind: "sparkGrid" },
      annotations: [
        { kind: "hline", value: 1.1, label: "support", tone: "info" },
        { kind: "zone", from: 1.05, to: 1.08, tone: "warn" },
        { kind: "hline", value: 1.2, tone: "danger" },
        { kind: "zone", from: 0.9, to: 0.95, tone: "info" },
      ],
    };
    expect(parsePanelSpec(spec, knownSymbols)).toEqual({ ok: true, spec });
  });

  it("accepts a spread transform (two symbol-like strings, not roster-checked)", () => {
    const spec = {
      v: 1,
      title: "EURUSD vs GBPUSD spread",
      source: { kind: "fxTicks", symbols: ["EURUSD", "GBPUSD"] },
      transforms: [{ kind: "spread", a: "EURUSD", b: "GBPUSD" }],
      viz: { kind: "line" },
    };
    expect(parsePanelSpec(spec, knownSymbols)).toEqual({ ok: true, spec });
  });

  it("accepts a gauge viz with an optional label", () => {
    const spec = {
      v: 1,
      title: "Session P&L",
      source: { kind: "analytics" },
      transforms: [],
      viz: { kind: "gauge", label: "P&L (USD)" },
    };
    expect(parsePanelSpec(spec, knownSymbols)).toEqual({ ok: true, spec });
  });

  it("tolerates unknown top-level keys — ignores rather than rejects", () => {
    const spec = {
      ...minimalValidSpec(),
      unexpectedExtra: "whatever",
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result.ok).toBe(true);
  });

  it("SKIPS the roster membership check when knownSymbols is empty, but still enforces symbol count", () => {
    const spec = {
      v: 1,
      title: "Unknown-to-roster symbol",
      source: { kind: "fxTicks", symbols: ["ZZZZZZ"] },
      transforms: [],
      viz: { kind: "line" },
    };
    expect(parsePanelSpec(spec, [])).toEqual({ ok: true, spec });

    const tooMany = {
      ...spec,
      source: { kind: "fxTicks", symbols: Array(9).fill("ZZZZZZ") },
    };
    const result = parsePanelSpec(tooMany, []);
    expect(result.ok).toBe(false);
  });
});

describe("parsePanelSpec — root shape", () => {
  it("rejects a non-object input", () => {
    const result = parsePanelSpec("not an object", knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("spec:"),
    });
  });

  it("rejects null", () => {
    const result = parsePanelSpec(null, knownSymbols);
    expect(result.ok).toBe(false);
  });
});

describe("parsePanelSpec — v", () => {
  it("rejects v !== 1", () => {
    const spec = { ...minimalValidSpec(), v: 2 };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("v:"),
    });
  });

  it("rejects a missing v", () => {
    const spec: Record<string, unknown> = { ...minimalValidSpec() };
    delete spec.v;
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });
});

describe("parsePanelSpec — title", () => {
  it("rejects an empty title", () => {
    const spec = { ...minimalValidSpec(), title: "" };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("title:"),
    });
  });

  it("rejects a title over 48 chars", () => {
    const spec = { ...minimalValidSpec(), title: "x".repeat(49) };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("accepts a title at exactly 48 chars", () => {
    const spec = { ...minimalValidSpec(), title: "x".repeat(48) };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(true);
  });

  it("rejects a non-string title", () => {
    const spec = { ...minimalValidSpec(), title: 42 };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });
});

describe("parsePanelSpec — rationale", () => {
  it("rejects a rationale over 200 chars", () => {
    const spec = { ...minimalValidSpec(), rationale: "x".repeat(201) };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("rationale:"),
    });
  });

  it("accepts a rationale at exactly 200 chars", () => {
    const spec = { ...minimalValidSpec(), rationale: "x".repeat(200) };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(true);
  });
});

describe("parsePanelSpec — source", () => {
  it("rejects an unknown source.kind", () => {
    const spec = {
      ...minimalValidSpec(),
      source: { kind: "somethingElse", symbols: ["EURUSD"] },
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("source.kind:"),
    });
  });

  it("rejects zero symbols on fxTicks", () => {
    const spec = {
      ...minimalValidSpec(),
      source: { kind: "fxTicks", symbols: [] },
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("source.symbols:"),
    });
  });

  it("rejects more than 8 symbols", () => {
    const spec = {
      ...minimalValidSpec(),
      source: {
        kind: "fxTicks",
        symbols: [
          "EURUSD",
          "GBPUSD",
          "USDJPY",
          "EURUSD",
          "GBPUSD",
          "USDJPY",
          "EURUSD",
          "GBPUSD",
          "USDJPY",
        ],
      },
    };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("rejects a symbol not in knownSymbols", () => {
    const spec = {
      ...minimalValidSpec(),
      source: { kind: "fxTicks", symbols: ["NOTAPAIR"] },
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("source.symbols:"),
    });
  });

  it("rejects a missing source", () => {
    const spec: Record<string, unknown> = { ...minimalValidSpec() };
    delete spec.source;
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });
});

describe("parsePanelSpec — transforms", () => {
  it("rejects more than 4 transforms", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [
        { kind: "returns" },
        { kind: "returns" },
        { kind: "returns" },
        { kind: "returns" },
        { kind: "returns" },
      ],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms:"),
    });
  });

  it("rejects an unknown transform kind", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "notAThing" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].kind:"),
    });
  });

  it("rejects window.seconds below 10", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "window", seconds: 9 }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].seconds:"),
    });
  });

  it("rejects window.seconds above 3600", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "window", seconds: 3601 }],
    };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("rejects a non-finite window.seconds", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "window", seconds: Number.POSITIVE_INFINITY }],
    };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("rejects rollingVol.samples below 2", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "rollingVol", samples: 1 }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].samples:"),
    });
  });

  it("rejects rollingVol.samples above 500", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "rollingVol", samples: 501 }],
    };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("rejects topN.n below 1", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "topN", n: 0, by: "value" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].n:"),
    });
  });

  it("rejects topN.n above 8", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "topN", n: 9, by: "value" }],
    };
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });

  it("rejects an invalid topN.by", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "topN", n: 3, by: "nonsense" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].by:"),
    });
  });

  it("rejects a spread transform missing b", () => {
    const spec = {
      ...minimalValidSpec(),
      transforms: [{ kind: "spread", a: "EURUSD" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("transforms[0].b:"),
    });
  });
});

describe("parsePanelSpec — viz", () => {
  it("rejects an unknown viz.kind", () => {
    const spec = { ...minimalValidSpec(), viz: { kind: "pie" } };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("viz.kind:"),
    });
  });

  it("rejects a missing viz", () => {
    const spec: Record<string, unknown> = { ...minimalValidSpec() };
    delete spec.viz;
    expect(parsePanelSpec(spec, knownSymbols).ok).toBe(false);
  });
});

describe("parsePanelSpec — annotations", () => {
  it("rejects more than 4 annotations", () => {
    const spec = {
      ...minimalValidSpec(),
      annotations: [
        { kind: "hline", value: 1, tone: "info" },
        { kind: "hline", value: 1, tone: "info" },
        { kind: "hline", value: 1, tone: "info" },
        { kind: "hline", value: 1, tone: "info" },
        { kind: "hline", value: 1, tone: "info" },
      ],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("annotations:"),
    });
  });

  it("rejects an unknown annotation kind", () => {
    const spec = {
      ...minimalValidSpec(),
      annotations: [{ kind: "arrow", value: 1, tone: "info" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("annotations[0].kind:"),
    });
  });

  it("rejects an unknown annotation tone", () => {
    const spec = {
      ...minimalValidSpec(),
      annotations: [{ kind: "hline", value: 1, tone: "critical" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("annotations[0].tone:"),
    });
  });

  it("rejects a non-finite hline.value", () => {
    const spec = {
      ...minimalValidSpec(),
      annotations: [{ kind: "hline", value: Number.NaN, tone: "info" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("annotations[0].value:"),
    });
  });

  it("rejects a zone missing 'to'", () => {
    const spec = {
      ...minimalValidSpec(),
      annotations: [{ kind: "zone", from: 1, tone: "warn" }],
    };
    const result = parsePanelSpec(spec, knownSymbols);
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("annotations[0].to:"),
    });
  });
});

describe("PANEL_SPEC_JSON_SCHEMA — derived from the same const arrays as the validator", () => {
  it("source.kind enum matches PANEL_SOURCE_KINDS", () => {
    const schema = PANEL_SPEC_JSON_SCHEMA as unknown as SourceKindSchemaShape;
    expect(schema.properties.source.properties.kind.enum).toEqual([
      ...PANEL_SOURCE_KINDS,
    ]);
  });

  it("viz.kind enum matches PANEL_VIZ_KINDS", () => {
    const schema = PANEL_SPEC_JSON_SCHEMA as unknown as VizKindSchemaShape;
    expect(schema.properties.viz.properties.kind.enum).toEqual([
      ...PANEL_VIZ_KINDS,
    ]);
  });

  it("transforms item kind enum matches PANEL_TRANSFORM_KINDS", () => {
    const schema =
      PANEL_SPEC_JSON_SCHEMA as unknown as TransformsKindSchemaShape;
    expect(schema.properties.transforms.items.properties.kind.enum).toEqual([
      ...PANEL_TRANSFORM_KINDS,
    ]);
  });

  it("transforms item 'by' enum matches PANEL_TOPN_BY_VALUES", () => {
    const schema = PANEL_SPEC_JSON_SCHEMA as unknown as TransformsBySchemaShape;
    expect(schema.properties.transforms.items.properties.by.enum).toEqual([
      ...PANEL_TOPN_BY_VALUES,
    ]);
  });

  it("annotations item kind enum matches PANEL_ANNOTATION_KINDS", () => {
    const schema =
      PANEL_SPEC_JSON_SCHEMA as unknown as AnnotationsKindSchemaShape;
    expect(schema.properties.annotations.items.properties.kind.enum).toEqual([
      ...PANEL_ANNOTATION_KINDS,
    ]);
  });

  it("annotations item tone enum matches PANEL_ANNOTATION_TONES", () => {
    const schema =
      PANEL_SPEC_JSON_SCHEMA as unknown as AnnotationsToneSchemaShape;
    expect(schema.properties.annotations.items.properties.tone.enum).toEqual([
      ...PANEL_ANNOTATION_TONES,
    ]);
  });
});

/** A minimal valid spec: fxTicks source + line viz, no transforms/annotations. */
function minimalValidSpec(): Record<string, unknown> {
  return {
    v: 1,
    title: "EURUSD line",
    source: { kind: "fxTicks", symbols: ["EURUSD"] },
    transforms: [],
    viz: { kind: "line" },
  };
}

interface SourceKindSchemaShape {
  properties: {
    source: { properties: { kind: { enum: readonly string[] } } };
  };
}

interface VizKindSchemaShape {
  properties: {
    viz: { properties: { kind: { enum: readonly string[] } } };
  };
}

interface TransformsKindSchemaShape {
  properties: {
    transforms: {
      items: { properties: { kind: { enum: readonly string[] } } };
    };
  };
}

interface TransformsBySchemaShape {
  properties: {
    transforms: {
      items: { properties: { by: { enum: readonly string[] } } };
    };
  };
}

interface AnnotationsKindSchemaShape {
  properties: {
    annotations: {
      items: { properties: { kind: { enum: readonly string[] } } };
    };
  };
}

interface AnnotationsToneSchemaShape {
  properties: {
    annotations: {
      items: { properties: { tone: { enum: readonly string[] } } };
    };
  };
}
