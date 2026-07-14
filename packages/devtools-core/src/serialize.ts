const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;
const MAX_STRING = 500;

interface SerializedRecord {
  [key: string]: SerializedValue;
}

export type SerializedValue =
  | null
  | boolean
  | number
  | string
  | SerializedValue[]
  | SerializedRecord;

/** JSON-safe, size-capped projection of an arbitrary runtime value. Tagged
 * objects ({$t: ...}) encode the shapes JSON can't: undefined, functions,
 * Map/Set, NaN/Infinity, truncations, depth cuts, and circular references.
 * Never throws — the worst case is a {$t:"error"} node. */
export function serializeValue(value: unknown): SerializedValue {
  return walk(value, 0, new WeakSet());
}

function serializeNumber(value: number): SerializedValue {
  if (Number.isFinite(value)) {
    return value;
  }

  return { $t: "num", v: String(value) };
}

function serializeString(value: string): SerializedValue {
  if (value.length <= MAX_STRING) {
    return value;
  }

  return {
    $t: "truncated-string",
    head: value.slice(0, MAX_STRING),
    count: value.length - MAX_STRING,
  };
}

function walkArray(
  arr: unknown[],
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  const out: SerializedValue[] = arr.slice(0, MAX_ENTRIES).map((v) => {
    return walk(v, depth + 1, seen);
  });

  if (arr.length > MAX_ENTRIES) {
    out.push({ $t: "truncated", count: arr.length - MAX_ENTRIES });
  }

  return out;
}

function walkMap(
  map: Map<unknown, unknown>,
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  const entries: SerializedValue[] = [];
  let i = 0;

  for (const [k, v] of map) {
    if (i >= MAX_ENTRIES) {
      entries.push({ $t: "truncated", count: map.size - MAX_ENTRIES });
      break;
    }

    entries.push([walk(k, depth + 1, seen), walk(v, depth + 1, seen)]);
    i += 1;
  }

  return { $t: "map", entries };
}

function walkSet(
  set: Set<unknown>,
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  const values: SerializedValue[] = [];
  let i = 0;

  for (const v of set) {
    if (i >= MAX_ENTRIES) {
      values.push({ $t: "truncated", count: set.size - MAX_ENTRIES });
      break;
    }

    values.push(walk(v, depth + 1, seen));
    i += 1;
  }

  return { $t: "set", values };
}

function walkPlainObject(
  obj: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  const out: SerializedRecord = {};
  const keys = Object.keys(obj);

  for (const key of keys.slice(0, MAX_ENTRIES)) {
    out[key] = walk(obj[key], depth + 1, seen);
  }

  if (keys.length > MAX_ENTRIES) {
    out.$truncatedKeys = { $t: "truncated", count: keys.length - MAX_ENTRIES };
  }

  return out;
}

function walkObject(
  obj: object,
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  seen.add(obj);

  try {
    if (Array.isArray(obj)) {
      return walkArray(obj, depth, seen);
    }

    if (obj instanceof Map) {
      return walkMap(obj, depth, seen);
    }

    if (obj instanceof Set) {
      return walkSet(obj, depth, seen);
    }

    return walkPlainObject(obj as Record<string, unknown>, depth, seen);
  } finally {
    seen.delete(obj);
  }
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): SerializedValue {
  try {
    if (value === null) {
      return null;
    }

    if (value === undefined) {
      return { $t: "undefined" };
    }

    const t = typeof value;

    if (t === "boolean") {
      return value as boolean;
    }

    if (t === "number") {
      return serializeNumber(value as number);
    }

    if (t === "bigint" || t === "symbol") {
      return { $t: t, v: String(value) };
    }

    if (t === "string") {
      return serializeString(value as string);
    }

    if (t === "function") {
      const fn = value as (...args: unknown[]) => unknown;

      return { $t: "fn", name: fn.name };
    }

    // objects from here on
    const obj = value as object;

    if (seen.has(obj)) {
      return { $t: "circular" };
    }

    if (depth >= MAX_DEPTH) {
      return { $t: "depth" };
    }

    return walkObject(obj, depth, seen);
  } catch (error) {
    return { $t: "error", message: String(error) };
  }
}
