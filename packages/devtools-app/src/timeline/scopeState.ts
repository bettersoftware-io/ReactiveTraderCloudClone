import type { MachineRow, StreamRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { parseStreamId } from "#/nav/scope";

/** Shared by `StateTab`: the empty change-set for the unpinned/unmarked case,
 * a single stable instance so callers can compare by reference. */
export const EMPTY_IDS: ReadonlySet<string> = new Set();

export function streamsInScope(
  streams: readonly StreamRow[],
  scope: Scope,
): readonly StreamRow[] {
  if (scope.kind === "presenter") {
    return streams.filter((row) => {
      return parseStreamId(row.streamId).presenter === scope.presenter;
    });
  }

  if (scope.kind === "stream") {
    return streams.filter((row) => {
      return row.streamId === scope.streamId;
    });
  }

  return streams;
}

export function machinesInScope(
  machines: readonly MachineRow[],
  scope: Scope,
): readonly MachineRow[] {
  if (scope.kind === "machineKind") {
    return machines.filter((row) => {
      return row.machineKind === scope.machineKind;
    });
  }

  if (scope.kind === "machine") {
    return machines.filter((row) => {
      return row.machineId === scope.machineId;
    });
  }

  return machines;
}

/** Shared by the stream and machine ≠-live marks: a row counts as changed
 * when it has no live counterpart, or its tracked value differs by
 * JSON.stringify comparison from the live counterpart's. */
export function changedIds<T>(
  pinned: readonly T[],
  live: readonly T[],
  keyOf: (row: T) => string,
  trackedValueOf: (row: T) => unknown,
): ReadonlySet<string> {
  const liveByKey = new Map(
    live.map((row) => {
      return [keyOf(row), row] as const;
    }),
  );
  const changed = new Set<string>();

  for (const row of pinned) {
    const liveRow = liveByKey.get(keyOf(row));

    if (
      liveRow === undefined ||
      JSON.stringify(trackedValueOf(liveRow)) !==
        JSON.stringify(trackedValueOf(row))
    ) {
      changed.add(keyOf(row));
    }
  }

  return changed;
}

export function streamKey(row: StreamRow): string {
  return row.streamId;
}

export function streamValue(row: StreamRow): unknown {
  return row.lastValue;
}

export function machineKey(row: MachineRow): string {
  return row.machineId;
}

export function machineValue(row: MachineRow): unknown {
  return row.state;
}

export function filterStreams(
  streams: readonly StreamRow[],
  query: string,
): readonly StreamRow[] {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return streams;
  }

  return streams.filter((row) => {
    if (row.streamId.toLowerCase().includes(needle)) {
      return true;
    }

    return (JSON.stringify(row.lastValue) ?? "").toLowerCase().includes(needle);
  });
}
