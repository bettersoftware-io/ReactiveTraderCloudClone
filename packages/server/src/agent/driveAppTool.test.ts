import { describe, expect, it, vi } from "vitest";

import type { DriveBatchV1 } from "@rtc/shared";
import { DRIVE_COMMAND_JSON_SCHEMA } from "@rtc/shared";

import {
  buildDriveAppTool,
  DRIVE_APP_TOOL_NAME,
  type DriveAppDeps,
} from "./driveAppTool.js";

describe("buildDriveAppTool", () => {
  it("names itself drive_app", () => {
    const { deps } = buildDeps();
    const tool = buildDriveAppTool(deps);

    expect(tool.name).toBe(DRIVE_APP_TOOL_NAME);
    expect(DRIVE_APP_TOOL_NAME).toBe("drive_app");
  });

  it("single-command batch: emits the normalized batch and reports applied: 1", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      commands: [{ kind: "switchTab", tab: "equities" }],
    });

    const expected: DriveBatchV1 = {
      v: 1,
      commands: [{ kind: "switchTab", tab: "equities" }],
    };
    expect(emitDrive).toHaveBeenCalledExactlyOnceWith(expected);
    expect(result).toContain("applied: 1");
  });

  it("multi-command batch (the persona's own few-shot): emits the normalized batch and reports applied: 2", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      commands: [
        { kind: "switchTab", tab: "equities" },
        {
          kind: "layout",
          op: "maximize",
          tab: "equities",
          panelId: "eq-chart",
        },
      ],
    });

    const expected: DriveBatchV1 = {
      v: 1,
      commands: [
        { kind: "switchTab", tab: "equities" },
        {
          kind: "layout",
          op: "maximize",
          tab: "equities",
          panelId: "eq-chart",
        },
      ],
    };
    expect(emitDrive).toHaveBeenCalledExactlyOnceWith(expected);
    expect(result).toContain("applied: 2");
  });

  it("strips unknown top-level fields (e.g. a model-supplied v) before validating — the handler owns v, not the model", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      v: 999,
      commands: [{ kind: "switchTab", tab: "fx" }],
    });

    expect(emitDrive).toHaveBeenCalledExactlyOnceWith({
      v: 1,
      commands: [{ kind: "switchTab", tab: "fx" }],
    });
    expect(result).toContain("applied: 1");
  });

  it("too many commands (9): rejects the WHOLE batch, returns the commands-bound error, and never emits", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const nineCommands = Array.from({ length: 9 }, () => {
      return { kind: "switchTab", tab: "fx" };
    });

    const result = await tool.run({ commands: nineCommands });

    expect(result).toBe("commands: must contain 1..8 commands");
    expect(emitDrive).not.toHaveBeenCalled();
  });

  it("unknown command kind: rejects the WHOLE batch, returns the '<field>: <problem>' error, and never emits", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      commands: [{ kind: "teleport", tab: "fx" }],
    });

    expect(result).toBe('commands[0].kind: unknown kind "teleport"');
    expect(emitDrive).not.toHaveBeenCalled();
  });

  it("mixed validity is impossible by design: one bad command among good ones rejects the ENTIRE batch — nothing partially applies", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      commands: [
        { kind: "switchTab", tab: "equities" },
        { kind: "switchTab", tab: "not-a-real-tab" },
        { kind: "setPowerSaver", level: "calm" },
      ],
    });

    expect(result).toBe(
      "commands[1].tab: must be one of fx, credit, equities, admin.",
    );
    expect(emitDrive).not.toHaveBeenCalled();
  });

  it("rejects a non-object input without emitting — the R1 finding that betaTool.parse is identity means this handler is the ONLY gate", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run("not an object");

    expect(result).toBe(
      'Invalid input: expected an object with a "commands" field.',
    );
    expect(emitDrive).not.toHaveBeenCalled();
  });

  it("rejects a missing commands field without emitting", async () => {
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({});

    expect(result).toBe("commands: must contain 1..8 commands");
    expect(emitDrive).not.toHaveBeenCalled();
  });

  it("declares an input schema requiring only commands (v is a handler-owned constant, kept off the model-facing envelope), embedding the commands item schema verbatim from DRIVE_COMMAND_JSON_SCHEMA", () => {
    const { deps } = buildDeps();
    const tool = buildDriveAppTool(deps);
    const schema = tool.inputSchema as unknown as DriveAppInputSchema;
    const sharedSchema = DRIVE_COMMAND_JSON_SCHEMA as unknown as {
      readonly properties: { readonly commands: unknown };
    };

    expect(schema.required).toEqual(["commands"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.v).toBeUndefined();
    expect(schema.properties.commands).toBe(sharedSchema.properties.commands);
  });

  it("is NOT confirm-gated: resolves with no ConfirmGate involved at all", async () => {
    // DriveAppDeps carries no confirmTrade/ConfirmGate field — the type
    // itself proves this at compile time. This test proves it at runtime.
    const { deps, emitDrive } = buildDeps();
    const tool = buildDriveAppTool(deps);

    const result = await tool.run({
      commands: [{ kind: "switchTab", tab: "fx" }],
    });

    expect(typeof result).toBe("string");
    expect(result).not.toContain("declined");
    expect(result).not.toContain("confirm");
    expect(emitDrive).toHaveBeenCalledTimes(1);
  });
});

/** `drive_app`'s input-schema shape this file's own schema-assertion test
 * casts `tool.inputSchema` (typed `Record<string, unknown>`) to. */
interface DriveAppInputSchema {
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
  readonly properties: {
    readonly commands: unknown;
    readonly v?: unknown;
  };
}

/** `buildDeps`' own return shape — named rather than inline per
 * `no-restricted-syntax`. */
interface BuiltDeps {
  readonly deps: DriveAppDeps;
  readonly emitDrive: ReturnType<typeof vi.fn>;
}

function buildDeps(overrides: Partial<DriveAppDeps> = {}): BuiltDeps {
  const emitDrive = vi.fn();

  const deps: DriveAppDeps = {
    emitDrive,
    ...overrides,
  };

  return { deps, emitDrive };
}
