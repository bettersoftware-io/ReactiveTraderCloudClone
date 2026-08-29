import type {
  InspectorState,
  LogRow,
  MachineRow,
  SerializedValue,
} from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { parseStreamId, scopeKey, streamLeafLabel } from "#/nav/scope";
import { sourceOfEvent } from "#/timeline/timelineModel";

export interface NavNode {
  id: string;
  label: string;
  scope: Scope | null;
  count: number;
  lastSeq: number;
  disposed: boolean;
  detail: string | null;
  children: readonly NavNode[];
}

/** The navigator's data (spec §3.1): four fixed roots built from the live
 * state (what exists) and the VISIBLE log (what happened since Clear).
 * Counts and lastSeq come from one pass over the log; the flash key is
 * lastSeq, so a node re-flashes exactly when its scope received a row. */
export function buildNavTree(
  state: InspectorState,
  visibleLog: readonly LogRow[],
): readonly NavNode[] {
  const tally = tallyLog(visibleLog);
  const last = visibleLog[visibleLog.length - 1];

  return [
    leaf("all", "All", { kind: "all" }, visibleLog.length, last?.seq ?? 0),
    {
      ...header("presenters", "Presenters"),
      children: presenterNodes(state, tally),
    },
    {
      ...header("machines", "Machines"),
      children: machineKindNodes(state, tally),
    },
    wireNode(visibleLog, tally),
  ];
}

/** `▼ in/s · ▲ out/s · reconnects` over the visible log, trailing 10 s window
 * measured from the log's own timestamps (replay-correct). Null when the
 * log carries no wire rows at all (the simulator-mode norm). */
export function wireHealthLine(visibleLog: readonly LogRow[]): string | null {
  const latestTs = visibleLog[visibleLog.length - 1]?.ts ?? 0;
  const windowStart = latestTs - RATE_WINDOW_MS;
  const seen = new Set<string>();
  let inCount = 0;
  let outCount = 0;
  let wireRows = 0;
  let reconnects = 0;

  for (const row of visibleLog) {
    if (row.event.kind === "wire:in" || row.event.kind === "wire:out") {
      wireRows += 1;

      if (row.ts >= windowStart) {
        if (row.event.kind === "wire:in") {
          inCount += 1;
        } else {
          outCount += 1;
        }
      }
    } else if (row.event.kind === "stream:registered") {
      if (seen.has(row.event.streamId)) {
        reconnects += 1;
      } else {
        seen.add(row.event.streamId);
      }
    }
  }

  if (wireRows === 0) {
    return null;
  }

  const seconds = RATE_WINDOW_MS / 1000;

  return `▼ ${(inCount / seconds).toFixed(1)} in/s · ▲ ${(outCount / seconds).toFixed(1)} out/s · reconnects: ${reconnects}`;
}

const RATE_WINDOW_MS = 10_000;
const ARGS_LABEL_MAX = 24;

interface Tally {
  count: number;
  lastSeq: number;
}

interface LogTally {
  streams: Map<string, Tally>;
  machines: Map<string, Tally>;
  msgTypes: Map<string, Tally>;
}

function presenterNodes(state: InspectorState, tally: LogTally): NavNode[] {
  const order: string[] = [];
  const byPresenter = new Map<string, NavNode[]>();

  for (const row of state.streams) {
    const presenter = parseStreamId(row.streamId).presenter;
    const t = tally.streams.get(row.streamId);
    const node = leaf(
      scopeKey({ kind: "stream", streamId: row.streamId }),
      streamLeafLabel(row.streamId),
      { kind: "stream", streamId: row.streamId },
      t?.count ?? 0,
      t?.lastSeq ?? 0,
    );
    const existing = byPresenter.get(presenter);

    if (existing) {
      existing.push(node);
    } else {
      byPresenter.set(presenter, [node]);
      order.push(presenter);
    }
  }

  return order
    .sort((a, b) => {
      return a.localeCompare(b);
    })
    .map((presenter) => {
      const children = byPresenter.get(presenter) ?? [];

      return rollup(
        scopeKey({ kind: "presenter", presenter }),
        presenter,
        { kind: "presenter", presenter },
        children,
      );
    });
}

function machineKindNodes(state: InspectorState, tally: LogTally): NavNode[] {
  const order: string[] = [];
  const byKind = new Map<string, NavNode[]>();

  for (const row of state.machines) {
    const t = tally.machines.get(row.machineId);
    const node: NavNode = {
      ...leaf(
        scopeKey({ kind: "machine", machineId: row.machineId }),
        machineLabel(row),
        { kind: "machine", machineId: row.machineId },
        t?.count ?? 0,
        t?.lastSeq ?? 0,
      ),
      disposed: row.disposed,
    };
    const existing = byKind.get(row.machineKind);

    if (existing) {
      existing.push(node);
    } else {
      byKind.set(row.machineKind, [node]);
      order.push(row.machineKind);
    }
  }

  return order
    .sort((a, b) => {
      return a.localeCompare(b);
    })
    .map((machineKind) => {
      return rollup(
        scopeKey({ kind: "machineKind", machineKind }),
        machineKind,
        { kind: "machineKind", machineKind },
        byKind.get(machineKind) ?? [],
      );
    });
}

function wireNode(visibleLog: readonly LogRow[], tally: LogTally): NavNode {
  const children = [...tally.msgTypes.entries()]
    .sort(([a], [b]) => {
      return a.localeCompare(b);
    })
    .map(([msgType, t]) => {
      return leaf(
        scopeKey({ kind: "msgType", msgType }),
        msgType,
        { kind: "msgType", msgType },
        t.count,
        t.lastSeq,
      );
    });

  return {
    ...rollup("wire", "Wire", { kind: "wire" }, children),
    detail: wireHealthLine(visibleLog),
  };
}

function tallyLog(visibleLog: readonly LogRow[]): LogTally {
  const streams = new Map<string, Tally>();
  const machines = new Map<string, Tally>();
  const msgTypes = new Map<string, Tally>();

  for (const row of visibleLog) {
    const source = sourceOfEvent(row.event);

    if (source === null) {
      continue;
    }

    const bucket =
      source.type === "stream"
        ? streams
        : source.type === "machine"
          ? machines
          : msgTypes;
    const t = bucket.get(source.id);

    if (t === undefined) {
      bucket.set(source.id, { count: 1, lastSeq: row.seq });
    } else {
      t.count += 1;
      t.lastSeq = Math.max(t.lastSeq, row.seq);
    }
  }

  return { streams, machines, msgTypes };
}

function leaf(
  id: string,
  label: string,
  scope: Scope,
  count: number,
  lastSeq: number,
): NavNode {
  return {
    id,
    label,
    scope,
    count,
    lastSeq,
    disposed: false,
    detail: null,
    children: [],
  };
}

function header(id: string, label: string): NavNode {
  return {
    id,
    label,
    scope: null,
    count: 0,
    lastSeq: 0,
    disposed: false,
    detail: null,
    children: [],
  };
}

function rollup(
  id: string,
  label: string,
  scope: Scope,
  children: readonly NavNode[],
): NavNode {
  let count = 0;
  let lastSeq = 0;

  for (const child of children) {
    count += child.count;
    lastSeq = Math.max(lastSeq, child.lastSeq);
  }

  return {
    id,
    label,
    scope,
    count,
    lastSeq,
    disposed: false,
    detail: null,
    children,
  };
}

function machineLabel(row: MachineRow): string {
  const args = compactArgs(row.args);

  return args === "" ? row.machineId : `${row.machineId} ${args}`;
}

function compactArgs(args: SerializedValue | null): string {
  if (args === null) {
    return "";
  }

  const json = JSON.stringify(args) ?? "";

  if (json === "[]") {
    return "";
  }

  return json.length > ARGS_LABEL_MAX
    ? `${json.slice(0, ARGS_LABEL_MAX)}…`
    : json;
}
