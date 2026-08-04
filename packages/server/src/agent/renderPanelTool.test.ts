import { describe, expect, it, vi } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import {
  buildRenderPanelTool,
  RENDER_PANEL_TOOL_NAME,
  type RenderPanelDeps,
} from "./renderPanelTool.js";

const KNOWN_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY"];

function validSpec(): PanelSpecV1 {
  return {
    v: 1,
    title: "GBP Volatility",
    source: { kind: "priceHistory", symbols: ["GBPUSD"] },
    transforms: [{ kind: "rollingVol", samples: 20 }],
    viz: { kind: "line" },
  };
}

function buildDeps(overrides: Partial<RenderPanelDeps> = {}): {
  readonly deps: RenderPanelDeps;
  readonly emitPanel: ReturnType<typeof vi.fn>;
  readonly mintPanelId: ReturnType<typeof vi.fn>;
} {
  const emitPanel = vi.fn();
  const mintPanelId = vi.fn(() => {
    return "panel-minted-1";
  });

  const deps: RenderPanelDeps = {
    knownSymbols: KNOWN_SYMBOLS,
    emitPanel,
    mintPanelId,
    ...overrides,
  };

  return { deps, emitPanel, mintPanelId };
}

describe("buildRenderPanelTool", () => {
  it("names itself render_panel", () => {
    const { deps } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    expect(tool.name).toBe(RENDER_PANEL_TOOL_NAME);
    expect(RENDER_PANEL_TOOL_NAME).toBe("render_panel");
  });

  it("valid spec, no targetPanelId: mints a fresh id, emits it, and reports it", async () => {
    const { deps, emitPanel, mintPanelId } = buildDeps();
    const tool = buildRenderPanelTool(deps);
    const spec = validSpec();

    const result = await tool.run({ spec });

    expect(mintPanelId).toHaveBeenCalledTimes(1);
    expect(emitPanel).toHaveBeenCalledExactlyOnceWith("panel-minted-1", spec);
    expect(result).toBe("Rendered panel panel-minted-1: GBP Volatility");
  });

  it("valid spec + targetPanelId: emits under the target id, never mints, and reports it", async () => {
    const { deps, emitPanel, mintPanelId } = buildDeps();
    const tool = buildRenderPanelTool(deps);
    const spec = validSpec();

    const result = await tool.run({ spec, targetPanelId: "p1" });

    expect(mintPanelId).not.toHaveBeenCalled();
    expect(emitPanel).toHaveBeenCalledExactlyOnceWith("p1", spec);
    expect(result).toBe("Rendered panel p1: GBP Volatility");
  });

  it("invalid spec: resolves to the validator's error string and never emits", async () => {
    const { deps, emitPanel, mintPanelId } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    const result = await tool.run({
      spec: {
        v: 1,
        title: "",
        source: { kind: "blotter" },
        transforms: [],
        viz: { kind: "table" },
      },
    });

    expect(result).toBe("title: must be 1-48 characters (got 0).");
    expect(emitPanel).not.toHaveBeenCalled();
    expect(mintPanelId).not.toHaveBeenCalled();
  });

  it("unknown symbol: resolves to the validator's error string and never emits", async () => {
    const { deps, emitPanel, mintPanelId } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    const result = await tool.run({
      spec: {
        v: 1,
        title: "Bogus",
        source: { kind: "fxTicks", symbols: ["ZZZXXX"] },
        transforms: [],
        viz: { kind: "line" },
      },
    });

    expect(result).toBe("source.symbols: unknown symbol: ZZZXXX.");
    expect(emitPanel).not.toHaveBeenCalled();
    expect(mintPanelId).not.toHaveBeenCalled();
  });

  it("rejects a non-object input without emitting", async () => {
    const { deps, emitPanel } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    const result = await tool.run("not an object");

    expect(result).toBe(
      'Invalid input: expected an object with a "spec" field.',
    );
    expect(emitPanel).not.toHaveBeenCalled();
  });

  it("rejects a non-string / empty targetPanelId without emitting", async () => {
    const { deps, emitPanel } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    const numericResult = await tool.run({
      spec: validSpec(),
      targetPanelId: 42,
    });
    const emptyResult = await tool.run({
      spec: validSpec(),
      targetPanelId: "",
    });

    expect(numericResult).toBe(
      'Invalid input: "targetPanelId" must be a non-empty string.',
    );
    expect(emptyResult).toBe(
      'Invalid input: "targetPanelId" must be a non-empty string.',
    );
    expect(emitPanel).not.toHaveBeenCalled();
  });

  it("declares its input schema requiring only spec, embedding PANEL_SPEC_JSON_SCHEMA", () => {
    const { deps } = buildDeps();
    const tool = buildRenderPanelTool(deps);
    const schema = tool.inputSchema as {
      readonly required: readonly string[];
      readonly properties: {
        readonly spec: { readonly required: readonly string[] };
      };
    };

    expect(schema.required).toEqual(["spec"]);
    expect(schema.properties.spec.required).toContain("v");
  });

  it("is NOT confirm-gated: resolves with no ConfirmGate involved at all", async () => {
    // RenderPanelDeps carries no confirmTrade/ConfirmGate field — the type
    // itself proves this at compile time. This test proves it at runtime:
    // the handler resolves to a normal string with nothing awaiting
    // approval, unlike execute_trade's run() which blocks on confirmTrade().
    const { deps, emitPanel } = buildDeps();
    const tool = buildRenderPanelTool(deps);

    const result = await tool.run({ spec: validSpec() });

    expect(typeof result).toBe("string");
    expect(result).not.toContain("declined");
    expect(result).not.toContain("confirm");
    expect(emitPanel).toHaveBeenCalledTimes(1);
  });
});
