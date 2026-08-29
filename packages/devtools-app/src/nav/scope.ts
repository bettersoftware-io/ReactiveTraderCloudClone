import type { InspectorState } from "@rtc/devtools-core";

import type { FamilyFilterState, SourcePill } from "#/timeline/timelineModel";
import { ALL_FAMILIES_ON } from "#/timeline/timelineModel";

/** The inspector's single selection — what the navigation tree has picked
 * (spec §3.2). Presenter = a store, its streams = slices; machines and the
 * wire are stores too. `all` is the unified timeline. */
export type Scope =
  | { kind: "all" }
  | { kind: "presenter"; presenter: string }
  | { kind: "stream"; streamId: string }
  | { kind: "machineKind"; machineKind: string }
  | { kind: "machine"; machineId: string }
  | { kind: "wire" }
  | { kind: "msgType"; msgType: string };

export const ALL_SCOPE: Scope = { kind: "all" };

export interface ParsedStreamId {
  presenter: string;
  prop: string;
  /** The raw `[…]` suffix `instrumentPresenters` appends for method streams
   * (the JSON-stringified arg tuple), or null for plain prop streams. */
  argsKey: string | null;
}

/** What a scope compiles down to — the two structural layers of
 * `TimelineFilter`. `pills: null` means unconstrained; an EMPTY array means
 * "matches nothing" (a presenter whose streams were all evicted must not
 * silently widen to every stream). */
export interface ScopeFilter {
  families: FamilyFilterState;
  pills: readonly SourcePill[] | null;
}

const NO_FAMILIES: FamilyFilterState = {
  stream: false,
  machine: false,
  wire: false,
  devtools: false,
};

/** Splits `key.prop` / `key.prop[JSON-args]` — the id convention written by
 * `instrumentPresenters` (devtools-core) and read by nobody in core. Lives
 * here on purpose: a future protocol with first-class identity deletes this
 * one helper. */
export function parseStreamId(streamId: string): ParsedStreamId {
  const dot = streamId.indexOf(".");

  if (dot === -1) {
    return { presenter: streamId, prop: "", argsKey: null };
  }

  const presenter = streamId.slice(0, dot);
  const rest = streamId.slice(dot + 1);
  const bracket = rest.indexOf("[");

  if (bracket === -1) {
    return { presenter, prop: rest, argsKey: null };
  }

  return {
    presenter,
    prop: rest.slice(0, bracket),
    argsKey: rest.slice(bracket),
  };
}

export function scopeKey(scope: Scope): string {
  switch (scope.kind) {
    case "all": {
      return "all";
    }

    case "presenter": {
      return `presenter:${scope.presenter}`;
    }

    case "stream": {
      return `stream:${scope.streamId}`;
    }

    case "machineKind": {
      return `machineKind:${scope.machineKind}`;
    }

    case "machine": {
      return `machine:${scope.machineId}`;
    }

    case "wire": {
      return "wire";
    }

    case "msgType": {
      return `msgType:${scope.msgType}`;
    }
  }
}

export function scopesEqual(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

export function compileScope(scope: Scope, state: InspectorState): ScopeFilter {
  switch (scope.kind) {
    case "all": {
      return { families: ALL_FAMILIES_ON, pills: null };
    }

    case "presenter": {
      const presenter = scope.presenter;
      const pills = state.streams
        .filter((row) => {
          return parseStreamId(row.streamId).presenter === presenter;
        })
        .map((row): SourcePill => {
          return { type: "stream", id: row.streamId };
        });

      return { families: onlyFamily("stream"), pills };
    }

    case "stream": {
      return {
        families: onlyFamily("stream"),
        pills: [{ type: "stream", id: scope.streamId }],
      };
    }

    case "machineKind": {
      const kind = scope.machineKind;
      const pills = state.machines
        .filter((row) => {
          return row.machineKind === kind;
        })
        .map((row): SourcePill => {
          return { type: "machine", id: row.machineId };
        });

      return { families: onlyFamily("machine"), pills };
    }

    case "machine": {
      return {
        families: onlyFamily("machine"),
        pills: [{ type: "machine", id: scope.machineId }],
      };
    }

    case "wire": {
      return { families: onlyFamily("wire"), pills: null };
    }

    case "msgType": {
      return {
        families: onlyFamily("wire"),
        pills: [{ type: "msgType", id: scope.msgType }],
      };
    }
  }
}

/** Tree-leaf label: `trades$`, `history$ · EURCAD`, `price$ · EURUSD`. */
export function streamLeafLabel(streamId: string): string {
  const parsed = parseStreamId(streamId);

  if (parsed.argsKey === null) {
    return parsed.prop;
  }

  return `${parsed.prop} · ${argsLabel(parsed.argsKey)}`;
}

/** A stream id rendered relative to the current scope (spec §3.2): the full
 * id under `all` (and any scope that does not contain it), the leaf label
 * inside its own presenter, and just the args (or the prop) inside itself. */
export function shortLabel(streamId: string, scope: Scope): string {
  if (scope.kind === "presenter") {
    return parseStreamId(streamId).presenter === scope.presenter
      ? streamLeafLabel(streamId)
      : streamId;
  }

  if (scope.kind === "stream" && scope.streamId === streamId) {
    const parsed = parseStreamId(streamId);

    return parsed.argsKey === null ? parsed.prop : argsLabel(parsed.argsKey);
  }

  return streamId;
}

function onlyFamily(family: keyof FamilyFilterState): FamilyFilterState {
  return { ...NO_FAMILIES, [family]: true };
}

/** `[["EURCAD"]]` → `EURCAD`; `[[{"symbol":"EURUSD",…}]]` → `EURUSD` (the
 * first string-valued field of an object arg); anything unparseable → the
 * raw key minus its outer brackets. */
function argsLabel(argsKey: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(argsKey);
  } catch {
    return stripOuterBrackets(argsKey);
  }

  const tuple = Array.isArray(parsed) ? parsed : [parsed];

  return tuple
    .map((arg) => {
      return argLabel(arg);
    })
    .join(", ");
}

function argLabel(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }

  if (Array.isArray(arg)) {
    return arg
      .map((inner) => {
        return argLabel(inner);
      })
      .join(", ");
  }

  if (arg !== null && typeof arg === "object") {
    for (const value of Object.values(arg)) {
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return JSON.stringify(arg) ?? "";
}

function stripOuterBrackets(argsKey: string): string {
  return argsKey.replace(/^\[+/, "").replace(/\]+$/, "");
}
