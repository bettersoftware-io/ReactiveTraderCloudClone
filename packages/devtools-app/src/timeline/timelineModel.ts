import type {
  DevtoolsEvent,
  LogRow,
  SerializedValue,
} from "@rtc/devtools-core";

export interface FamilyFilterState {
  stream: boolean;
  machine: boolean;
  wire: boolean;
  devtools: boolean;
}

export type TimelineFamily = keyof FamilyFilterState;

export type SourcePillType = "stream" | "machine" | "msgType";

export interface SourcePill {
  type: SourcePillType;
  id: string;
}

export interface RadiusFilter {
  centerTs: number;
  windowMs: number;
}

export interface TimelineFilter {
  families: FamilyFilterState;
  pills: readonly SourcePill[];
  text: string;
  radius: RadiusFilter | null;
}

export const ALL_FAMILIES_ON: FamilyFilterState = {
  stream: true,
  machine: true,
  wire: true,
  devtools: true,
};

export const EMPTY_TIMELINE_FILTER: TimelineFilter = {
  families: ALL_FAMILIES_ON,
  pills: [],
  text: "",
  radius: null,
};

/** The causality heuristic's half-window (spec §4): "everything within
 * ±100 ms of this event". */
export const RADIUS_WINDOW_MS = 100;

export function familyOf(kind: DevtoolsEvent["kind"]): TimelineFamily {
  if (kind.startsWith("stream:")) {
    return "stream";
  }

  if (kind.startsWith("machine:")) {
    return "machine";
  }

  if (kind.startsWith("wire:")) {
    return "wire";
  }

  return "devtools";
}

export function sourceOfEvent(event: DevtoolsEvent): SourcePill | null {
  if (event.kind === "stream:registered" || event.kind === "stream:emission") {
    return { type: "stream", id: event.streamId };
  }

  if (
    event.kind === "machine:created" ||
    event.kind === "machine:state" ||
    event.kind === "machine:intent" ||
    event.kind === "machine:disposed"
  ) {
    return { type: "machine", id: event.machineId };
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return { type: "msgType", id: event.msgType };
  }

  return null;
}

export function pillKey(pill: SourcePill): string {
  return `${pill.type}:${pill.id}`;
}

export function filterLog(
  log: readonly LogRow[],
  filter: TimelineFilter,
): readonly LogRow[] {
  const needle = filter.text.trim().toLowerCase();

  return log.filter((row) => {
    if (!filter.families[familyOf(row.kind)]) {
      return false;
    }

    if (filter.pills.length > 0 && !rowMatchesPills(row, filter.pills)) {
      return false;
    }

    if (needle !== "" && !row.summary.toLowerCase().includes(needle)) {
      return false;
    }

    if (filter.radius !== null) {
      const delta = Math.abs(row.ts - filter.radius.centerTs);

      if (delta > filter.radius.windowMs) {
        return false;
      }
    }

    return true;
  });
}

/** Spec §3.3 comparability: the last event before `row` with the same source
 * identity — streamId for emissions, machineId for machine:state, msgType AND
 * direction for wire traffic. Null for kinds with no meaningful predecessor. */
export function findPredecessorRow(
  log: readonly LogRow[],
  row: LogRow,
): LogRow | null {
  const key = comparabilityKey(row.event);

  if (key === null) {
    return null;
  }

  for (let i = indexOfSeq(log, row.seq) - 1; i >= 0; i -= 1) {
    const candidate = log[i];

    if (candidate !== undefined && comparabilityKey(candidate.event) === key) {
      return candidate;
    }
  }

  return null;
}

export function diffableValueOf(event: DevtoolsEvent): SerializedValue | null {
  if (event.kind === "stream:emission") {
    return event.value;
  }

  if (event.kind === "machine:state") {
    return event.state;
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return event.payload;
  }

  return null;
}

/** Locate the log seq of a machine intent by identity (used by the Machines
 * lens to pin the timeline from an intent-history row). */
export function seqOfMachineIntent(
  log: readonly LogRow[],
  machineId: string,
  name: string,
  ts: number,
): number | null {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const row = log[i];

    if (
      row !== undefined &&
      row.event.kind === "machine:intent" &&
      row.event.machineId === machineId &&
      row.event.name === name &&
      row.ts === ts
    ) {
      return row.seq;
    }
  }

  return null;
}

function rowMatchesPills(row: LogRow, pills: readonly SourcePill[]): boolean {
  const source = sourceOfEvent(row.event);

  if (source === null) {
    return false;
  }

  return pills.some((pill) => {
    return pill.type === source.type && pill.id === source.id;
  });
}

function comparabilityKey(event: DevtoolsEvent): string | null {
  if (event.kind === "stream:emission") {
    return `stream:${event.streamId}`;
  }

  if (event.kind === "machine:state") {
    return `machine:${event.machineId}`;
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return `${event.kind}:${event.msgType}`;
  }

  return null;
}

/** log is seq-sorted; binary search the row's position. */
function indexOfSeq(log: readonly LogRow[], seq: number): number {
  let lo = 0;
  let hi = log.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midSeq = log[mid]?.seq ?? 0;

    if (midSeq === seq) {
      return mid;
    }

    if (midSeq < seq) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}
