/**
 * The wire side of `DriveCommand` v1 (the vocabulary itself is domain:
 * `@rtc/domain`'s `jarvis/driveCommand.ts`). Transport-neutral like the rest
 * of `@rtc/shared/jarvis` — the P5 mirror of the `PanelSpec` pattern in
 * `panelSpec.ts`, consumed by both the server tool handler and the
 * client-side apply adapter.
 *
 * `parseDriveBatch` is a hand-rolled structural walk (no schema library,
 * mirroring how `@rtc/agent-tools` handlers validate their own inputs by
 * hand, and how `parsePanelSpec` validates `PanelSpecV1`) so its error
 * strings can be handed back to the model verbatim as tool-result text.
 * `DRIVE_COMMAND_JSON_SCHEMA` is the model-facing raw JSON Schema
 * description of the same shape; every enum/const on the schema is derived
 * from the same domain `const` arrays the validator checks against so the
 * two descriptions of "what kinds exist" cannot drift apart.
 */

import {
  DRIVE_CHART_TYPES,
  DRIVE_COMMAND_KINDS,
  DRIVE_INDICATORS,
  DRIVE_LAYOUT_OPS,
  DRIVE_PANES,
  DRIVE_POWER_LEVELS,
  DRIVE_SKINS,
  DRIVE_TABS,
  DRIVE_TIMEFRAMES,
  type DriveBatchV1,
  type DriveCommandV1,
} from "@rtc/domain";

export type DriveBatchParseResult =
  | { readonly ok: true; readonly batch: DriveBatchV1 }
  | { readonly ok: false; readonly error: string };

export const MAX_DRIVE_COMMANDS = 8;
const MIN_DRIVE_COMMANDS = 1;
const IDENTIFIER_MIN_LENGTH = 1;
const IDENTIFIER_MAX_LENGTH = 64;

/** A single field-scoped result: either the parsed value, or an
 * already-formatted `"<field>: <problem>"` error string. */
type FieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function fieldOk<T>(value: T): FieldResult<T> {
  return { ok: true, value };
}

function fieldFail<T>(field: string, problem: string): FieldResult<T> {
  return { ok: false, error: `${field}: ${problem}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type-guard `.includes` — narrows `candidate` to the literal union `T`
 * rather than leaving it `unknown`, so the caller's `kind`-typed variant
 * construction below type-checks. */
function isOneOf<T extends string>(
  values: readonly T[],
  candidate: unknown,
): candidate is T {
  return (
    typeof candidate === "string" &&
    (values as readonly string[]).includes(candidate)
  );
}

/** `key` is the property to read off `input`; `displayField` is the name
 * used in the error message — they differ for indexed command entries
 * (e.g. reading `tab` off `commands[2]`, but reporting it as
 * `"commands[2].tab"`). */
function validateEnumField<T extends string>(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
  values: readonly T[],
): FieldResult<T> {
  const value = input[key];

  if (!isOneOf(values, value)) {
    return fieldFail(displayField, `must be one of ${values.join(", ")}.`);
  }

  return fieldOk(value);
}

/** `key`/`displayField` split as in `validateEnumField` above. */
function validateStringLength(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
  minLength: number,
  maxLength: number,
): FieldResult<string> {
  const value = input[key];

  if (typeof value !== "string") {
    return fieldFail(displayField, "must be a string.");
  }

  if (value.length < minLength || value.length > maxLength) {
    return fieldFail(
      displayField,
      `must be ${minLength}-${maxLength} characters (got ${value.length}).`,
    );
  }

  return fieldOk(value);
}

/** `key`/`displayField` split as in `validateEnumField` above. */
function validateBoolean(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
): FieldResult<boolean> {
  const value = input[key];

  if (typeof value !== "boolean") {
    return fieldFail(displayField, "must be a boolean.");
  }

  return fieldOk(value);
}

/** The three command kinds whose entire payload beyond `kind` is a single
 * `panelId` string — `dismissPanel`, `dockPanel`, `undockPanel`. Shared by
 * `validateCommand`'s three matching branches so the panelId-length rule
 * (`IDENTIFIER_MIN_LENGTH`..`IDENTIFIER_MAX_LENGTH`) lives in one place. */
type PanelIdCommandKind = "dismissPanel" | "dockPanel" | "undockPanel";

function validatePanelIdCommand(
  raw: Record<string, unknown>,
  prefix: string,
  kind: PanelIdCommandKind,
): FieldResult<DriveCommandV1> {
  const panelIdResult = validateStringLength(
    raw,
    "panelId",
    `${prefix}.panelId`,
    IDENTIFIER_MIN_LENGTH,
    IDENTIFIER_MAX_LENGTH,
  );

  if (!panelIdResult.ok) {
    return panelIdResult;
  }

  return fieldOk({ kind, panelId: panelIdResult.value });
}

function validateCommand(
  raw: unknown,
  index: number,
): FieldResult<DriveCommandV1> {
  const prefix = `commands[${index}]`;

  if (!isRecord(raw)) {
    return fieldFail(prefix, "must be an object.");
  }

  const kind = raw.kind;

  if (!isOneOf(DRIVE_COMMAND_KINDS, kind)) {
    return fieldFail(`${prefix}.kind`, `unknown kind ${JSON.stringify(kind)}`);
  }

  if (kind === "switchTab") {
    const tabResult = validateEnumField(
      raw,
      "tab",
      `${prefix}.tab`,
      DRIVE_TABS,
    );

    if (!tabResult.ok) {
      return tabResult;
    }

    return fieldOk({ kind, tab: tabResult.value });
  }

  if (kind === "layout") {
    const opResult = validateEnumField(
      raw,
      "op",
      `${prefix}.op`,
      DRIVE_LAYOUT_OPS,
    );

    if (!opResult.ok) {
      return opResult;
    }

    const tabResult = validateEnumField(
      raw,
      "tab",
      `${prefix}.tab`,
      DRIVE_TABS,
    );

    if (!tabResult.ok) {
      return tabResult;
    }

    const panelIdResult = validateStringLength(
      raw,
      "panelId",
      `${prefix}.panelId`,
      IDENTIFIER_MIN_LENGTH,
      IDENTIFIER_MAX_LENGTH,
    );

    if (!panelIdResult.ok) {
      return panelIdResult;
    }

    return fieldOk({
      kind,
      op: opResult.value,
      tab: tabResult.value,
      panelId: panelIdResult.value,
    });
  }

  if (kind === "eqSelect") {
    const symbolResult = validateStringLength(
      raw,
      "symbol",
      `${prefix}.symbol`,
      IDENTIFIER_MIN_LENGTH,
      IDENTIFIER_MAX_LENGTH,
    );

    if (!symbolResult.ok) {
      return symbolResult;
    }

    return fieldOk({ kind, symbol: symbolResult.value });
  }

  if (kind === "eqTimeframe") {
    const tfResult = validateEnumField(
      raw,
      "tf",
      `${prefix}.tf`,
      DRIVE_TIMEFRAMES,
    );

    if (!tfResult.ok) {
      return tfResult;
    }

    return fieldOk({ kind, tf: tfResult.value });
  }

  if (kind === "eqChartType") {
    const chartResult = validateEnumField(
      raw,
      "chart",
      `${prefix}.chart`,
      DRIVE_CHART_TYPES,
    );

    if (!chartResult.ok) {
      return chartResult;
    }

    return fieldOk({ kind, chart: chartResult.value });
  }

  if (kind === "eqIndicator") {
    const idResult = validateEnumField(
      raw,
      "id",
      `${prefix}.id`,
      DRIVE_INDICATORS,
    );

    if (!idResult.ok) {
      return idResult;
    }

    const onResult = validateBoolean(raw, "on", `${prefix}.on`);

    if (!onResult.ok) {
      return onResult;
    }

    return fieldOk({ kind, id: idResult.value, on: onResult.value });
  }

  if (kind === "eqPane") {
    const idResult = validateEnumField(raw, "id", `${prefix}.id`, DRIVE_PANES);

    if (!idResult.ok) {
      return idResult;
    }

    const onResult = validateBoolean(raw, "on", `${prefix}.on`);

    if (!onResult.ok) {
      return onResult;
    }

    return fieldOk({ kind, id: idResult.value, on: onResult.value });
  }

  if (kind === "setTheme") {
    const skinResult = validateEnumField(
      raw,
      "skin",
      `${prefix}.skin`,
      DRIVE_SKINS,
    );

    if (!skinResult.ok) {
      return skinResult;
    }

    return fieldOk({ kind, skin: skinResult.value });
  }

  if (kind === "setPowerSaver") {
    const levelResult = validateEnumField(
      raw,
      "level",
      `${prefix}.level`,
      DRIVE_POWER_LEVELS,
    );

    if (!levelResult.ok) {
      return levelResult;
    }

    return fieldOk({ kind, level: levelResult.value });
  }

  if (kind === "dismissPanel") {
    return validatePanelIdCommand(raw, prefix, kind);
  }

  if (kind === "dockPanel") {
    return validatePanelIdCommand(raw, prefix, kind);
  }

  // kind === "undockPanel"
  return validatePanelIdCommand(raw, prefix, kind);
}

function validateCommands(
  input: Record<string, unknown>,
): FieldResult<readonly DriveCommandV1[]> {
  const value = input.commands;

  if (
    !Array.isArray(value) ||
    value.length < MIN_DRIVE_COMMANDS ||
    value.length > MAX_DRIVE_COMMANDS
  ) {
    return fieldFail(
      "commands",
      `must contain ${MIN_DRIVE_COMMANDS}..${MAX_DRIVE_COMMANDS} commands`,
    );
  }

  const commands: DriveCommandV1[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const result = validateCommand(value[index], index);

    if (!result.ok) {
      return result;
    }

    commands.push(result.value);
  }

  return fieldOk(commands);
}

/**
 * Parses and validates an unknown value into a `DriveBatchV1`. Membership
 * checks beyond the closed vocabulary here (e.g. whether `symbol` is a real
 * currency pair, or `panelId` a real panel) are deliberately out of scope —
 * that's the driver's job once the batch is applied.
 */
export function parseDriveBatch(input: unknown): DriveBatchParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: "batch: must be an object." };
  }

  if (input.v !== 1) {
    return { ok: false, error: "v: must be exactly 1." };
  }

  const commandsResult = validateCommands(input);

  if (!commandsResult.ok) {
    return { ok: false, error: commandsResult.error };
  }

  const batch: DriveBatchV1 = { v: 1, commands: commandsResult.value };

  return { ok: true, batch };
}

/** Raw JSON Schema for a single command entry, one branch per `kind` — an
 * `anyOf` rather than a flattened `properties` bag (unlike `panelSpec.ts`'s
 * transform/annotation items) because two branches (`eqIndicator`,
 * `eqPane`) both use an `id` field drawn from a *different* closed set, so
 * a shared property would blur `DRIVE_INDICATORS` and `DRIVE_PANES`
 * together. `anyOf`, not `oneOf`: the installed `@anthropic-ai/sdk`'s own
 * strict-schema canonicalizer (`lib/transform-json-schema.js`) rewrites
 * `oneOf` → `anyOf` before sending it to the API, so `anyOf` is what
 * Anthropic actually treats as canonical here — writing it directly avoids
 * relying on an SDK-internal rewrite. The two keywords are semantically
 * identical for this schema: every branch is mutually exclusive via its own
 * `kind: {const: ...}` + `additionalProperties: false`, so at most one
 * branch can ever validate. Every `enum`/`const` below is spread from the
 * same `const` arrays `parseDriveBatch` checks against, so the two
 * descriptions of "what kinds exist" cannot drift. */
const DRIVE_COMMAND_ITEM_SCHEMA: Record<string, unknown> = {
  anyOf: [
    {
      type: "object",
      properties: {
        kind: { const: "switchTab" },
        tab: { type: "string", enum: [...DRIVE_TABS] },
      },
      required: ["kind", "tab"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "layout" },
        op: { type: "string", enum: [...DRIVE_LAYOUT_OPS] },
        tab: { type: "string", enum: [...DRIVE_TABS] },
        panelId: {
          type: "string",
          minLength: IDENTIFIER_MIN_LENGTH,
          maxLength: IDENTIFIER_MAX_LENGTH,
        },
      },
      required: ["kind", "op", "tab", "panelId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "eqSelect" },
        symbol: {
          type: "string",
          minLength: IDENTIFIER_MIN_LENGTH,
          maxLength: IDENTIFIER_MAX_LENGTH,
          description: "Any currency/equity-like symbol; not roster-checked.",
        },
      },
      required: ["kind", "symbol"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "eqTimeframe" },
        tf: { type: "string", enum: [...DRIVE_TIMEFRAMES] },
      },
      required: ["kind", "tf"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "eqChartType" },
        chart: { type: "string", enum: [...DRIVE_CHART_TYPES] },
      },
      required: ["kind", "chart"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "eqIndicator" },
        id: { type: "string", enum: [...DRIVE_INDICATORS] },
        on: { type: "boolean" },
      },
      required: ["kind", "id", "on"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "eqPane" },
        id: { type: "string", enum: [...DRIVE_PANES] },
        on: { type: "boolean" },
      },
      required: ["kind", "id", "on"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "setTheme" },
        skin: { type: "string", enum: [...DRIVE_SKINS] },
      },
      required: ["kind", "skin"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "setPowerSaver" },
        level: { type: "string", enum: [...DRIVE_POWER_LEVELS] },
      },
      required: ["kind", "level"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "dismissPanel" },
        panelId: {
          type: "string",
          minLength: IDENTIFIER_MIN_LENGTH,
          maxLength: IDENTIFIER_MAX_LENGTH,
        },
      },
      required: ["kind", "panelId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "dockPanel" },
        panelId: {
          type: "string",
          minLength: IDENTIFIER_MIN_LENGTH,
          maxLength: IDENTIFIER_MAX_LENGTH,
        },
      },
      required: ["kind", "panelId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "undockPanel" },
        panelId: {
          type: "string",
          minLength: IDENTIFIER_MIN_LENGTH,
          maxLength: IDENTIFIER_MAX_LENGTH,
        },
      },
      required: ["kind", "panelId"],
      additionalProperties: false,
    },
  ],
};

/** Raw JSON Schema for a whole `DriveBatchV1` — same style as
 * `@rtc/agent-tools` and `PANEL_SPEC_JSON_SCHEMA`. Descriptive for the
 * model, not itself the enforcement mechanism: `parseDriveBatch` is the
 * actual gate, hand-rolled so its rejection messages can be returned to the
 * model verbatim. NOT used verbatim as `drive_app`'s own tool `inputSchema`
 * — the server's `driveAppTool.ts` builds its own model-facing envelope
 * (deliberately omitting `v`, an internal constant with no informational
 * value to the model) and consumes only this schema's `.properties.commands`
 * sub-schema (embedded by reference, so it can't drift from what
 * `parseDriveBatch` validates). This schema's own top-level shape (`{v,
 * commands}`) is what `parseDriveBatch` validates against directly, and what
 * a client-side apply adapter would validate a full batch against. */
export const DRIVE_COMMAND_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    v: { const: 1 },
    commands: {
      type: "array",
      minItems: MIN_DRIVE_COMMANDS,
      maxItems: MAX_DRIVE_COMMANDS,
      description: "Ordered list of drive commands to apply, 1-8.",
      items: DRIVE_COMMAND_ITEM_SCHEMA,
    },
  },
  required: ["v", "commands"],
  additionalProperties: false,
};
