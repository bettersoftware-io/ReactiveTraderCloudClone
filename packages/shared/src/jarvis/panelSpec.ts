/**
 * `PanelSpec` v1 — the generative-UI vocabulary a Jarvis brain emits (via the
 * server's `render_panel` tool, added in a later task) to describe one
 * desk panel: where its data comes from, what to do to it, and how to draw
 * it. Transport-neutral like the rest of `@rtc/shared/jarvis` — consumed by
 * both the server tool handler and the client-side render adapter.
 *
 * `parsePanelSpec` is a hand-rolled structural walk (no schema library,
 * mirroring how `@rtc/agent-tools` handlers validate their own inputs by
 * hand) so its error strings can be handed back to the model verbatim as
 * tool-result text. `PANEL_SPEC_JSON_SCHEMA` is the model-facing raw JSON
 * Schema description of the same shape; every enum list on the schema is
 * derived from the same `const` arrays the validator checks against so the
 * two descriptions of "what kinds exist" cannot drift apart.
 */

export const PANEL_SOURCE_KINDS = [
  "fxTicks",
  "priceHistory",
  "analytics",
  "blotter",
] as const;

export const PANEL_VIZ_KINDS = [
  "line",
  "table",
  "gauge",
  "sparkGrid",
  "heatmap",
] as const;

export const PANEL_TRANSFORM_KINDS = [
  "window",
  "returns",
  "rollingVol",
  "spread",
  "topN",
] as const;

export const PANEL_ANNOTATION_KINDS = ["hline", "zone"] as const;

export const PANEL_ANNOTATION_TONES = ["info", "warn", "danger"] as const;

export const PANEL_TOPN_BY_VALUES = ["value", "change"] as const;

export type PanelAnnotationTone = (typeof PANEL_ANNOTATION_TONES)[number];

export interface PanelSpecV1 {
  readonly v: 1;
  /** 1-48 chars. */
  readonly title: string;
  /** ≤200 chars, provenance tooltip. */
  readonly rationale?: string;
  readonly source: PanelSource;
  /** ≤4, applied in order. */
  readonly transforms: readonly PanelTransform[];
  readonly viz: PanelViz;
  /** ≤4. */
  readonly annotations?: readonly PanelAnnotation[];
}

export type PanelSource =
  | { readonly kind: "fxTicks"; readonly symbols: readonly string[] }
  | { readonly kind: "priceHistory"; readonly symbols: readonly string[] }
  | { readonly kind: "analytics" }
  | { readonly kind: "blotter" };

export type PanelTransform =
  | { readonly kind: "window"; readonly seconds: number }
  | { readonly kind: "returns" }
  | { readonly kind: "rollingVol"; readonly samples: number }
  | { readonly kind: "spread"; readonly a: string; readonly b: string }
  | {
      readonly kind: "topN";
      readonly n: number;
      readonly by: "value" | "change";
    };

export type PanelViz =
  | { readonly kind: "line" }
  | { readonly kind: "table" }
  | { readonly kind: "gauge"; readonly label?: string }
  | { readonly kind: "sparkGrid" }
  | { readonly kind: "heatmap" };

export type PanelAnnotation =
  | {
      readonly kind: "hline";
      readonly value: number;
      readonly label?: string;
      readonly tone: PanelAnnotationTone;
    }
  | {
      readonly kind: "zone";
      readonly from: number;
      readonly to: number;
      readonly tone: PanelAnnotationTone;
    };

export type ParsePanelSpecResult =
  | { readonly ok: true; readonly spec: PanelSpecV1 }
  | { readonly ok: false; readonly error: string };

const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 48;
const RATIONALE_MAX_LENGTH = 200;
const MIN_SYMBOLS = 1;
const MAX_SYMBOLS = 8;
const MAX_TRANSFORMS = 4;
const MAX_ANNOTATIONS = 4;
const WINDOW_SECONDS_MIN = 10;
const WINDOW_SECONDS_MAX = 3600;
const ROLLING_VOL_SAMPLES_MIN = 2;
const ROLLING_VOL_SAMPLES_MAX = 500;
const TOP_N_MIN = 1;
const TOP_N_MAX = 8;

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Type-guard `.includes` — narrows `candidate` to the literal union `T`
 * rather than leaving it `unknown`, so the caller's `kind`/`tone`-typed
 * variant construction below type-checks. */
function isOneOf<T extends string>(
  values: readonly T[],
  candidate: unknown,
): candidate is T {
  return (
    typeof candidate === "string" &&
    (values as readonly string[]).includes(candidate)
  );
}

function validateStringLength(
  input: Record<string, unknown>,
  field: string,
  minLength: number,
  maxLength: number,
): FieldResult<string> {
  const value = input[field];

  if (typeof value !== "string") {
    return fieldFail(field, "must be a string.");
  }

  if (value.length < minLength || value.length > maxLength) {
    return fieldFail(
      field,
      `must be ${minLength}-${maxLength} characters (got ${value.length}).`,
    );
  }

  return fieldOk(value);
}

/** `key` is the property to read off `input`; `displayField` is the name
 * used in the error message — they differ for nested objects (e.g. reading
 * `label` off a `viz` object, but reporting it as `"viz.label"`). */
function validateOptionalStringLength(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
  maxLength: number,
): FieldResult<string | undefined> {
  if (!(key in input) || input[key] === undefined) {
    return fieldOk(undefined);
  }

  const value = input[key];

  if (typeof value !== "string") {
    return fieldFail(displayField, "must be a string.");
  }

  if (value.length > maxLength) {
    return fieldFail(
      displayField,
      `must be at most ${maxLength} characters (got ${value.length}).`,
    );
  }

  return fieldOk(value);
}

/** `key` is the property to read off `input`; `displayField` is the name
 * used in the error message — they differ for nested/indexed objects (e.g.
 * reading `seconds` off a `transforms[0]` entry, but reporting it as
 * `"transforms[0].seconds"`). */
function validateFiniteNumberInRange(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
  min: number,
  max: number,
): FieldResult<number> {
  const value = input[key];

  if (!isFiniteNumber(value)) {
    return fieldFail(displayField, "must be a finite number.");
  }

  if (value < min || value > max) {
    return fieldFail(displayField, `must be between ${min} and ${max}.`);
  }

  return fieldOk(value);
}

/** `key` is the property to read off `input`; `displayField` is the name
 * used in the error message (see `validateFiniteNumberInRange` above). */
function validateNonEmptyString(
  input: Record<string, unknown>,
  key: string,
  displayField: string,
): FieldResult<string> {
  const value = input[key];

  if (typeof value !== "string" || value.length === 0) {
    return fieldFail(displayField, "must be a non-empty string.");
  }

  return fieldOk(value);
}

function validateSource(
  input: Record<string, unknown>,
  knownSymbols: readonly string[],
): FieldResult<PanelSource> {
  const raw = input.source;

  if (!isRecord(raw)) {
    return fieldFail("source", "must be an object.");
  }

  const kind = raw.kind;

  if (!isOneOf(PANEL_SOURCE_KINDS, kind)) {
    return fieldFail(
      "source.kind",
      `must be one of ${PANEL_SOURCE_KINDS.join(", ")}.`,
    );
  }

  if (kind === "analytics" || kind === "blotter") {
    return fieldOk({ kind });
  }

  const symbolsResult = validateSymbols(raw, "source.symbols", knownSymbols);

  if (!symbolsResult.ok) {
    return symbolsResult;
  }

  return fieldOk({ kind, symbols: symbolsResult.value });
}

function validateSymbols(
  input: Record<string, unknown>,
  field: string,
  knownSymbols: readonly string[],
): FieldResult<readonly string[]> {
  const value = input.symbols;

  if (
    !Array.isArray(value) ||
    !value.every((s) => {
      return typeof s === "string";
    })
  ) {
    return fieldFail(field, "must be an array of strings.");
  }

  if (value.length < MIN_SYMBOLS || value.length > MAX_SYMBOLS) {
    return fieldFail(
      field,
      `must have ${MIN_SYMBOLS}-${MAX_SYMBOLS} symbols (got ${value.length}).`,
    );
  }

  if (knownSymbols.length > 0) {
    const unknown = value.find((s) => {
      return !knownSymbols.includes(s);
    });

    if (unknown !== undefined) {
      return fieldFail(field, `unknown symbol: ${unknown}.`);
    }
  }

  return fieldOk(value as readonly string[]);
}

function validateTransform(
  raw: unknown,
  index: number,
): FieldResult<PanelTransform> {
  const prefix = `transforms[${index}]`;

  if (!isRecord(raw)) {
    return fieldFail(prefix, "must be an object.");
  }

  const kind = raw.kind;

  if (!isOneOf(PANEL_TRANSFORM_KINDS, kind)) {
    return fieldFail(
      `${prefix}.kind`,
      `must be one of ${PANEL_TRANSFORM_KINDS.join(", ")}.`,
    );
  }

  if (kind === "returns") {
    return fieldOk({ kind });
  }

  if (kind === "window") {
    const secondsResult = validateFiniteNumberInRange(
      raw,
      "seconds",
      `${prefix}.seconds`,
      WINDOW_SECONDS_MIN,
      WINDOW_SECONDS_MAX,
    );

    if (!secondsResult.ok) {
      return secondsResult;
    }

    return fieldOk({ kind, seconds: secondsResult.value });
  }

  if (kind === "rollingVol") {
    const samplesResult = validateFiniteNumberInRange(
      raw,
      "samples",
      `${prefix}.samples`,
      ROLLING_VOL_SAMPLES_MIN,
      ROLLING_VOL_SAMPLES_MAX,
    );

    if (!samplesResult.ok) {
      return samplesResult;
    }

    return fieldOk({ kind, samples: samplesResult.value });
  }

  if (kind === "spread") {
    const aResult = validateNonEmptyString(raw, "a", `${prefix}.a`);

    if (!aResult.ok) {
      return aResult;
    }

    const bResult = validateNonEmptyString(raw, "b", `${prefix}.b`);

    if (!bResult.ok) {
      return bResult;
    }

    return fieldOk({ kind, a: aResult.value, b: bResult.value });
  }

  // kind === "topN"
  const nResult = validateFiniteNumberInRange(
    raw,
    "n",
    `${prefix}.n`,
    TOP_N_MIN,
    TOP_N_MAX,
  );

  if (!nResult.ok) {
    return nResult;
  }

  const by = raw.by;

  if (!isOneOf(PANEL_TOPN_BY_VALUES, by)) {
    return fieldFail(
      `${prefix}.by`,
      `must be one of ${PANEL_TOPN_BY_VALUES.join(", ")}.`,
    );
  }

  return fieldOk({ kind, n: nResult.value, by });
}

function validateTransforms(
  input: Record<string, unknown>,
): FieldResult<readonly PanelTransform[]> {
  const value = input.transforms;

  if (!Array.isArray(value)) {
    return fieldFail("transforms", "must be an array.");
  }

  if (value.length > MAX_TRANSFORMS) {
    return fieldFail(
      "transforms",
      `must have at most ${MAX_TRANSFORMS} entries (got ${value.length}).`,
    );
  }

  const transforms: PanelTransform[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const result = validateTransform(value[index], index);

    if (!result.ok) {
      return result;
    }

    transforms.push(result.value);
  }

  return fieldOk(transforms);
}

function validateViz(input: Record<string, unknown>): FieldResult<PanelViz> {
  const raw = input.viz;

  if (!isRecord(raw)) {
    return fieldFail("viz", "must be an object.");
  }

  const kind = raw.kind;

  if (!isOneOf(PANEL_VIZ_KINDS, kind)) {
    return fieldFail(
      "viz.kind",
      `must be one of ${PANEL_VIZ_KINDS.join(", ")}.`,
    );
  }

  if (kind !== "gauge") {
    return fieldOk({ kind });
  }

  const labelResult = validateOptionalStringLength(
    raw,
    "label",
    "viz.label",
    TITLE_MAX_LENGTH,
  );

  if (!labelResult.ok) {
    return labelResult;
  }

  return fieldOk(
    labelResult.value === undefined
      ? { kind }
      : { kind, label: labelResult.value },
  );
}

function validateAnnotation(
  raw: unknown,
  index: number,
): FieldResult<PanelAnnotation> {
  const prefix = `annotations[${index}]`;

  if (!isRecord(raw)) {
    return fieldFail(prefix, "must be an object.");
  }

  const kind = raw.kind;

  if (!isOneOf(PANEL_ANNOTATION_KINDS, kind)) {
    return fieldFail(
      `${prefix}.kind`,
      `must be one of ${PANEL_ANNOTATION_KINDS.join(", ")}.`,
    );
  }

  const tone = raw.tone;

  if (!isOneOf(PANEL_ANNOTATION_TONES, tone)) {
    return fieldFail(
      `${prefix}.tone`,
      `must be one of ${PANEL_ANNOTATION_TONES.join(", ")}.`,
    );
  }

  if (kind === "hline") {
    const valueResult = validateFiniteNumberInRange(
      raw,
      "value",
      `${prefix}.value`,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    if (!valueResult.ok) {
      return valueResult;
    }

    const labelResult = validateOptionalStringLength(
      raw,
      "label",
      `${prefix}.label`,
      TITLE_MAX_LENGTH,
    );

    if (!labelResult.ok) {
      return labelResult;
    }

    return fieldOk(
      labelResult.value === undefined
        ? { kind, value: valueResult.value, tone }
        : { kind, value: valueResult.value, label: labelResult.value, tone },
    );
  }

  // kind === "zone"
  const fromResult = validateFiniteNumberInRange(
    raw,
    "from",
    `${prefix}.from`,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );

  if (!fromResult.ok) {
    return fromResult;
  }

  const toResult = validateFiniteNumberInRange(
    raw,
    "to",
    `${prefix}.to`,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );

  if (!toResult.ok) {
    return toResult;
  }

  return fieldOk({
    kind,
    from: fromResult.value,
    to: toResult.value,
    tone,
  });
}

function validateAnnotations(
  input: Record<string, unknown>,
): FieldResult<readonly PanelAnnotation[] | undefined> {
  if (!("annotations" in input) || input.annotations === undefined) {
    return fieldOk(undefined);
  }

  const value = input.annotations;

  if (!Array.isArray(value)) {
    return fieldFail("annotations", "must be an array.");
  }

  if (value.length > MAX_ANNOTATIONS) {
    return fieldFail(
      "annotations",
      `must have at most ${MAX_ANNOTATIONS} entries (got ${value.length}).`,
    );
  }

  const annotations: PanelAnnotation[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const result = validateAnnotation(value[index], index);

    if (!result.ok) {
      return result;
    }

    annotations.push(result.value);
  }

  return fieldOk(annotations);
}

/**
 * Parses and validates an unknown value into a `PanelSpecV1`, per the
 * bounds documented on the fields above. `knownSymbols` is the currency-pair
 * roster to check `source.symbols` membership against; pass an empty array
 * to skip the roster check (the client parse seam may not have one handy)
 * while still enforcing the symbol-count bound.
 */
export function parsePanelSpec(
  input: unknown,
  knownSymbols: readonly string[],
): ParsePanelSpecResult {
  if (!isRecord(input)) {
    return { ok: false, error: "spec: must be an object." };
  }

  if (input.v !== 1) {
    return { ok: false, error: "v: must be exactly 1." };
  }

  const titleResult = validateStringLength(
    input,
    "title",
    TITLE_MIN_LENGTH,
    TITLE_MAX_LENGTH,
  );

  if (!titleResult.ok) {
    return { ok: false, error: titleResult.error };
  }

  const rationaleResult = validateOptionalStringLength(
    input,
    "rationale",
    "rationale",
    RATIONALE_MAX_LENGTH,
  );

  if (!rationaleResult.ok) {
    return { ok: false, error: rationaleResult.error };
  }

  const sourceResult = validateSource(input, knownSymbols);

  if (!sourceResult.ok) {
    return { ok: false, error: sourceResult.error };
  }

  const transformsResult = validateTransforms(input);

  if (!transformsResult.ok) {
    return { ok: false, error: transformsResult.error };
  }

  const vizResult = validateViz(input);

  if (!vizResult.ok) {
    return { ok: false, error: vizResult.error };
  }

  const annotationsResult = validateAnnotations(input);

  if (!annotationsResult.ok) {
    return { ok: false, error: annotationsResult.error };
  }

  const spec: PanelSpecV1 = {
    v: 1,
    title: titleResult.value,
    ...(rationaleResult.value !== undefined
      ? { rationale: rationaleResult.value }
      : {}),
    source: sourceResult.value,
    transforms: transformsResult.value,
    viz: vizResult.value,
    ...(annotationsResult.value !== undefined
      ? { annotations: annotationsResult.value }
      : {}),
  };

  return { ok: true, spec };
}

/** JSON Schema for a single symbols array — shared between the fxTicks and
 * priceHistory source-kind branches below. */
const SYMBOLS_SCHEMA: Record<string, unknown> = {
  type: "array",
  items: { type: "string" },
  minItems: MIN_SYMBOLS,
  maxItems: MAX_SYMBOLS,
  description: "Currency-pair symbols, e.g. EURUSD. Must be known pairs.",
};

/** Raw JSON Schema for the `render_panel` tool input — same style as
 * `@rtc/agent-tools`. Descriptive for the model, not itself the enforcement
 * mechanism: `parsePanelSpec` is the actual gate, hand-rolled so its
 * rejection messages can be returned to the model verbatim. Every `enum`
 * below is spread from the same `const` arrays `parsePanelSpec` checks
 * against, so the two descriptions of "what kinds exist" cannot drift. */
export const PANEL_SPEC_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    v: { const: 1 },
    title: {
      type: "string",
      minLength: TITLE_MIN_LENGTH,
      maxLength: TITLE_MAX_LENGTH,
      description: "Short panel title shown in its header.",
    },
    rationale: {
      type: "string",
      maxLength: RATIONALE_MAX_LENGTH,
      description:
        "Optional — why this panel answers the user's request. Shown as a provenance tooltip.",
    },
    source: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...PANEL_SOURCE_KINDS] },
        symbols: SYMBOLS_SCHEMA,
      },
      required: ["kind"],
      additionalProperties: false,
      description:
        "Where the panel's data comes from. symbols is required for fxTicks/priceHistory, absent for analytics/blotter.",
    },
    transforms: {
      type: "array",
      maxItems: MAX_TRANSFORMS,
      description: "Applied in order, at most 4.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...PANEL_TRANSFORM_KINDS] },
          seconds: {
            type: "number",
            minimum: WINDOW_SECONDS_MIN,
            maximum: WINDOW_SECONDS_MAX,
            description: "window only.",
          },
          samples: {
            type: "number",
            minimum: ROLLING_VOL_SAMPLES_MIN,
            maximum: ROLLING_VOL_SAMPLES_MAX,
            description: "rollingVol only.",
          },
          a: { type: "string", description: "spread only." },
          b: { type: "string", description: "spread only." },
          n: {
            type: "number",
            minimum: TOP_N_MIN,
            maximum: TOP_N_MAX,
            description: "topN only.",
          },
          by: {
            type: "string",
            enum: [...PANEL_TOPN_BY_VALUES],
            description: "topN only.",
          },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
    viz: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...PANEL_VIZ_KINDS] },
        label: {
          type: "string",
          maxLength: TITLE_MAX_LENGTH,
          description: "gauge only.",
        },
      },
      required: ["kind"],
      additionalProperties: false,
      description: "How to draw the panel.",
    },
    annotations: {
      type: "array",
      maxItems: MAX_ANNOTATIONS,
      description: "At most 4.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...PANEL_ANNOTATION_KINDS] },
          tone: { type: "string", enum: [...PANEL_ANNOTATION_TONES] },
          value: { type: "number", description: "hline only." },
          label: {
            type: "string",
            maxLength: TITLE_MAX_LENGTH,
            description: "hline only.",
          },
          from: { type: "number", description: "zone only." },
          to: { type: "number", description: "zone only." },
        },
        required: ["kind", "tone"],
        additionalProperties: false,
      },
    },
  },
  required: ["v", "title", "source", "transforms", "viz"],
  additionalProperties: false,
};
