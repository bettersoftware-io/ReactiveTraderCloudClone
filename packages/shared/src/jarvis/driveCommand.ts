/**
 * `DriveCommand` v1 — the closed JSON command vocabulary a Jarvis brain emits
 * (via a later task's drive-the-app tool) to act on the desk directly:
 * switch tabs, resize/dismiss panels, drive the equities chart controls,
 * change theme/power-saver. Transport-neutral like the rest of
 * `@rtc/shared/jarvis` — the P5 mirror of the `PanelSpec` pattern in
 * `panelSpec.ts`, consumed by both the server tool handler and the
 * client-side apply adapter.
 *
 * `parseDriveBatch` is a hand-rolled structural walk (no schema library,
 * mirroring how `@rtc/agent-tools` handlers validate their own inputs by
 * hand, and how `parsePanelSpec` validates `PanelSpecV1`) so its error
 * strings can be handed back to the model verbatim as tool-result text.
 * `DRIVE_COMMAND_JSON_SCHEMA` is the model-facing raw JSON Schema
 * description of the same shape; every enum/const on the schema is derived
 * from the same `const` arrays the validator checks against so the two
 * descriptions of "what kinds exist" cannot drift apart.
 */

export const DRIVE_TABS = ["fx", "credit", "equities", "admin"] as const;
export type DriveTab = (typeof DRIVE_TABS)[number];

export const DRIVE_LAYOUT_OPS = [
  "maximize",
  "restore",
  "collapse",
  "expand",
] as const;
type DriveLayoutOp = (typeof DRIVE_LAYOUT_OPS)[number];

export const DRIVE_TIMEFRAMES = ["1D", "1W", "1M", "3M"] as const;
type DriveTimeframe = (typeof DRIVE_TIMEFRAMES)[number];

export const DRIVE_CHART_TYPES = ["candles", "line", "area"] as const;
type DriveChartType = (typeof DRIVE_CHART_TYPES)[number];

export const DRIVE_INDICATORS = ["sma20", "ema50"] as const;
type DriveIndicator = (typeof DRIVE_INDICATORS)[number];

export const DRIVE_PANES = ["rsi", "macd"] as const;
type DrivePane = (typeof DRIVE_PANES)[number];

export const DRIVE_SKINS = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
] as const;
type DriveSkin = (typeof DRIVE_SKINS)[number];

export const DRIVE_POWER_LEVELS = ["off", "calm", "freeze"] as const;
type DrivePowerLevel = (typeof DRIVE_POWER_LEVELS)[number];

export const DRIVE_COMMAND_KINDS = [
  "switchTab",
  "layout",
  "eqSelect",
  "eqTimeframe",
  "eqChartType",
  "eqIndicator",
  "eqPane",
  "setTheme",
  "setPowerSaver",
  "dismissPanel",
] as const;

export type DriveCommandV1 =
  | { readonly kind: "switchTab"; readonly tab: DriveTab }
  | {
      readonly kind: "layout";
      readonly op: DriveLayoutOp;
      readonly tab: DriveTab;
      readonly panelId: string;
    }
  | { readonly kind: "eqSelect"; readonly symbol: string }
  | { readonly kind: "eqTimeframe"; readonly tf: DriveTimeframe }
  | { readonly kind: "eqChartType"; readonly chart: DriveChartType }
  | {
      readonly kind: "eqIndicator";
      readonly id: DriveIndicator;
      readonly on: boolean;
    }
  | { readonly kind: "eqPane"; readonly id: DrivePane; readonly on: boolean }
  | { readonly kind: "setTheme"; readonly skin: DriveSkin }
  | { readonly kind: "setPowerSaver"; readonly level: DrivePowerLevel }
  | { readonly kind: "dismissPanel"; readonly panelId: string };

export interface DriveBatchV1 {
  readonly v: 1;
  /** 1-8 commands, applied in order. */
  readonly commands: readonly DriveCommandV1[];
}

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

  // kind === "dismissPanel"
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

/** Raw JSON Schema for a single command entry, one branch per `kind` — a
 * `oneOf` rather than a flattened `properties` bag (unlike `panelSpec.ts`'s
 * transform/annotation items) because two branches (`eqIndicator`,
 * `eqPane`) both use an `id` field drawn from a *different* closed set, so
 * a shared property would blur `DRIVE_INDICATORS` and `DRIVE_PANES`
 * together. Every `enum`/`const` below is spread from the same `const`
 * arrays `parseDriveBatch` checks against, so the two descriptions of
 * "what kinds exist" cannot drift. */
const DRIVE_COMMAND_ITEM_SCHEMA: Record<string, unknown> = {
  oneOf: [
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
  ],
};

/** Raw JSON Schema for the drive-batch tool input — same style as
 * `@rtc/agent-tools` and `PANEL_SPEC_JSON_SCHEMA`. Descriptive for the
 * model, not itself the enforcement mechanism: `parseDriveBatch` is the
 * actual gate, hand-rolled so its rejection messages can be returned to the
 * model verbatim. */
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
