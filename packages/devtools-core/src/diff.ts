import type { SerializedValue } from "./serialize";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  /** Object keys and array indices from the root to the changed node; [] = root. */
  path: readonly (string | number)[];
  kind: DiffKind;
  /** null for "added". */
  before: SerializedValue | null;
  /** null for "removed". */
  after: SerializedValue | null;
}

const MAX_DIFF_ENTRIES = 200;

/** Structural diff over two serializer outputs. Plain records and arrays
 * recurse; primitives and tagged nodes ({$t: ...}) are leaves compared by JSON
 * equality. Inputs are already depth/size-capped by serializeValue, so the
 * walk is bounded; MAX_DIFF_ENTRIES is a formality against pathological
 * fan-out. */
export function diffSerialized(
  prev: SerializedValue,
  next: SerializedValue,
): readonly DiffEntry[] {
  const out: DiffEntry[] = [];
  walkDiff(prev, next, [], out);

  return out;
}

type SerializedRecord = Record<string, SerializedValue>;

function walkDiff(
  prev: SerializedValue,
  next: SerializedValue,
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  if (out.length >= MAX_DIFF_ENTRIES) {
    return;
  }

  if (jsonEqual(prev, next)) {
    return;
  }

  if (isPlainRecord(prev) && isPlainRecord(next)) {
    walkRecords(prev, next, path, out);

    return;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    walkArrays(prev, next, path, out);

    return;
  }

  out.push({ path, kind: "changed", before: prev, after: next });
}

function walkRecords(
  prev: SerializedRecord,
  next: SerializedRecord,
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  for (const key of Object.keys(prev)) {
    if (key in next) {
      walkDiff(prev[key] ?? null, next[key] ?? null, [...path, key], out);
    } else {
      out.push({
        path: [...path, key],
        kind: "removed",
        before: prev[key] ?? null,
        after: null,
      });
    }
  }

  for (const key of Object.keys(next)) {
    if (!(key in prev)) {
      out.push({
        path: [...path, key],
        kind: "added",
        before: null,
        after: next[key] ?? null,
      });
    }
  }
}

function walkArrays(
  prev: readonly SerializedValue[],
  next: readonly SerializedValue[],
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  const max = Math.max(prev.length, next.length);

  for (let i = 0; i < max; i += 1) {
    if (i >= prev.length) {
      out.push({
        path: [...path, i],
        kind: "added",
        before: null,
        after: next[i] ?? null,
      });
    } else if (i >= next.length) {
      out.push({
        path: [...path, i],
        kind: "removed",
        before: prev[i] ?? null,
        after: null,
      });
    } else {
      walkDiff(prev[i] ?? null, next[i] ?? null, [...path, i], out);
    }
  }
}

function isPlainRecord(value: SerializedValue): value is SerializedRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as SerializedRecord).$t !== "string"
  );
}

function jsonEqual(a: SerializedValue, b: SerializedValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
