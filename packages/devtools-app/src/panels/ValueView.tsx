import type { ReactElement } from "react";

import type { SerializedValue } from "@rtc/devtools-core";

import styles from "#/panels/ValueView.module.css";

/** Recursive renderer for a `SerializedValue` — the shared leaf shared by the
 * state-tree, machine-registry, and (Task 10) log/wire panels. Primitives
 * render inline; objects/arrays/Map/Set render as native `<details>`
 * disclosures (no state management, collapsed below the first level — only
 * `depth === 0` starts open); every serializer `$t` tag from
 * `devtools-core/serialize.ts` gets a distinct one-line rendering, and an
 * unrecognized tag falls back to compact raw JSON instead of crashing. */
export function ValueView({ value, depth = 0 }: ValueViewProps): ReactElement {
  if (value === null) {
    return <span className={styles.literal}>null</span>;
  }

  const t = typeof value;

  if (t === "boolean" || t === "number") {
    return <span className={styles.literal}>{String(value)}</span>;
  }

  if (t === "string") {
    return <span className={styles.string}>"{value as string}"</span>;
  }

  if (Array.isArray(value)) {
    return <ArrayNode items={value} depth={depth} />;
  }

  const obj = value as Record<string, SerializedValue>;
  const tag = tagOf(obj);

  if (tag !== null) {
    return <TaggedNode tag={tag} obj={obj} depth={depth} />;
  }

  return <ObjectNode obj={obj} depth={depth} />;
}

export interface ValueViewProps {
  value: SerializedValue | null;
  /** Internal recursion depth, 0 at the root. Callers never pass this — it
   * drives the "collapsed below the first level" disclosure default. */
  depth?: number;
}

/** The serializer (`devtools-core/serialize.ts`) appends a `{$t:"truncated",
 * count}` marker as the LAST entry of an overflowed array/map-entries/set-
 * values list, once it hits the 50-entry cap. That marker is a real list
 * element (it renders inline as the "…+N" overflow row via `ValueView`'s own
 * "truncated" tag handling) but it is NOT one of the original entries — so
 * `Array`/`Map`/`Set` headers must count `entries.length - 1 + marker.count`,
 * not `entries.length`, to show the true pre-truncation size. */
function truncationMarker(
  items: readonly SerializedValue[],
): Record<string, SerializedValue> | null {
  const last = items.at(-1);

  return last !== undefined && isTaggedRecord(last, "truncated") ? last : null;
}

function trueCount(items: readonly SerializedValue[]): number {
  const marker = truncationMarker(items);

  return marker
    ? items.length - 1 + numberField(marker, "count")
    : items.length;
}

interface ArrayNodeProps {
  items: readonly SerializedValue[];
  depth: number;
}

function ArrayNode({ items, depth }: ArrayNodeProps): ReactElement {
  return (
    <details className={styles.node} open={depth === 0}>
      <summary
        className={styles.summary}
      >{`Array(${trueCount(items)})`}</summary>
      <div className={styles.children}>
        {withPositionalKeys(items).map((entry) => {
          return (
            <div key={entry.key} className={styles.entry}>
              <ValueView value={entry.value} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    </details>
  );
}

interface ObjectNodeProps {
  obj: Record<string, SerializedValue>;
  depth: number;
}

function ObjectNode({ obj, depth }: ObjectNodeProps): ReactElement {
  const keys = Object.keys(obj).filter((key) => {
    return key !== "$truncatedKeys";
  });
  const truncatedKeys = obj.$truncatedKeys;

  return (
    <details className={styles.node} open={depth === 0}>
      <summary className={styles.summary}>{`Object(${keys.length})`}</summary>
      <div className={styles.children}>
        {keys.map((key) => {
          return (
            <div key={key} className={styles.entry}>
              <span className={styles.key}>{key}:</span>
              <ValueView value={obj[key]} depth={depth + 1} />
            </div>
          );
        })}
        {isTaggedRecord(truncatedKeys, "truncated") ? (
          <div className={styles.entry}>
            <span className={styles.marker}>
              {`…+${numberField(truncatedKeys, "count")} keys`}
            </span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

interface TaggedNodeProps {
  tag: string;
  obj: Record<string, SerializedValue>;
  depth: number;
}

function TaggedNode({ tag, obj, depth }: TaggedNodeProps): ReactElement {
  if (tag === "undefined") {
    return <span className={styles.keyword}>undefined</span>;
  }

  if (tag === "num" || tag === "bigint" || tag === "symbol") {
    const suffix = tag === "bigint" ? "n" : "";

    return (
      <span
        className={styles.literal}
      >{`${stringField(obj, "v")}${suffix}`}</span>
    );
  }

  if (tag === "fn") {
    const name = stringField(obj, "name");

    return <span className={styles.fn}>{`ƒ ${name || "(anonymous)"}`}</span>;
  }

  if (tag === "circular") {
    return (
      <span className={styles.marker} title="circular reference">
        ↺
      </span>
    );
  }

  if (tag === "depth") {
    return (
      <span className={styles.marker} title="max depth reached">
        …
      </span>
    );
  }

  if (tag === "error") {
    return (
      <span className={styles.error}>{`⚠ ${stringField(obj, "message")}`}</span>
    );
  }

  if (tag === "map") {
    return <MapNode entries={arrayField(obj, "entries")} depth={depth} />;
  }

  if (tag === "set") {
    return <SetNode values={arrayField(obj, "values")} depth={depth} />;
  }

  if (tag === "truncated") {
    return (
      <span className={styles.marker}>{`…+${numberField(obj, "count")}`}</span>
    );
  }

  if (tag === "truncated-string") {
    const head = stringField(obj, "head");
    const count = numberField(obj, "count");

    return <span className={styles.string}>{`"${head}"…+${count} chars`}</span>;
  }

  return <span className={styles.unknown}>{compactJson(obj)}</span>;
}

interface MapNodeProps {
  entries: readonly SerializedValue[];
  depth: number;
}

function MapNode({ entries, depth }: MapNodeProps): ReactElement {
  return (
    <details className={styles.node} open={depth === 0}>
      <summary
        className={styles.summary}
      >{`Map(${trueCount(entries)})`}</summary>
      <div className={styles.children}>
        {withPositionalKeys(entries).map((positioned) => {
          return (
            <div key={positioned.key} className={styles.entry}>
              <MapEntry entry={positioned.value} depth={depth} />
            </div>
          );
        })}
      </div>
    </details>
  );
}

interface MapEntryProps {
  entry: SerializedValue;
  depth: number;
}

function MapEntry({ entry, depth }: MapEntryProps): ReactElement {
  if (isPair(entry)) {
    return (
      <>
        <ValueView value={entry[0]} depth={depth + 1} />
        <span className={styles.arrow}> → </span>
        <ValueView value={entry[1]} depth={depth + 1} />
      </>
    );
  }

  return <ValueView value={entry} depth={depth + 1} />;
}

interface SetNodeProps {
  values: readonly SerializedValue[];
  depth: number;
}

function SetNode({ values, depth }: SetNodeProps): ReactElement {
  return (
    <details className={styles.node} open={depth === 0}>
      <summary
        className={styles.summary}
      >{`Set(${trueCount(values)})`}</summary>
      <div className={styles.children}>
        {withPositionalKeys(values).map((entry) => {
          return (
            <div key={entry.key} className={styles.entry}>
              <ValueView value={entry.value} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    </details>
  );
}

function tagOf(obj: Record<string, SerializedValue>): string | null {
  const t = obj.$t;

  return typeof t === "string" ? t : null;
}

function isTaggedRecord(
  value: SerializedValue,
  wantedTag: string,
): value is Record<string, SerializedValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    tagOf(value) === wantedTag
  );
}

function isPair(
  value: SerializedValue,
): value is [SerializedValue, SerializedValue] {
  return Array.isArray(value) && value.length === 2;
}

function stringField(
  obj: Record<string, SerializedValue>,
  key: string,
): string {
  const v = obj[key];

  return typeof v === "string" ? v : "";
}

function numberField(
  obj: Record<string, SerializedValue>,
  key: string,
): number {
  const v = obj[key];

  return typeof v === "number" ? v : 0;
}

function arrayField(
  obj: Record<string, SerializedValue>,
  key: string,
): SerializedValue[] {
  const v = obj[key];

  return Array.isArray(v) ? v : [];
}

function compactJson(value: SerializedValue): string {
  return JSON.stringify(value);
}

interface PositionalEntry<T> {
  value: T;
  key: string;
}

/** Pairs each item with a positional React key WITHOUT exposing the index in
 * the map callback that renders JSX (`biome`'s `noArrayIndexKey` flags any
 * `key` expression that reads a `.map` callback's own index parameter — this
 * list has no natural id, so the index is assigned here, one level removed
 * from the render). */
function withPositionalKeys<T>(items: readonly T[]): Array<PositionalEntry<T>> {
  return items.map((value, i) => {
    return { value, key: `${i}` };
  });
}
