import { useState } from "react";

import type { InspectorState, LiveHistory, LogRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { compileScope } from "#/nav/scope";
import type { TimelineFilter } from "#/timeline/timelineModel";
import {
  EMPTY_TIMELINE_FILTER,
  filterLog,
  hasSeq,
  RADIUS_WINDOW_MS,
} from "#/timeline/timelineModel";

/** "pinned" carries the row itself (spec §6.2): the log caps at 5000 rows and
 * evicts oldest-first, so re-finding the row by seq each render silently
 * loses the Event/Diff tabs minutes into a live session. */
type TimelineSelection =
  | { mode: "follow" }
  | { mode: "pinned"; seq: number; row: LogRow };

export interface TimelineModel {
  selection: TimelineSelection;
  filter: TimelineFilter;
  rows: readonly LogRow[];
  selectedRow: LogRow | null;
  pinnedState: InspectorState | null;
  agedOut: boolean;
  reconstructError: string | null;
  pinnedRowEvicted: boolean;
  pinnedRowHidden: boolean;
  pinnedBeforeClear: boolean;
  tailAttached: boolean;
  pin: (row: LogRow) => void;
  resume: () => void;
  selectPrev: () => void;
  selectNext: () => void;
  setText: (text: string) => void;
  setRadiusAround: (row: LogRow) => void;
  clearRadius: () => void;
  clear: () => void;
  unclear: () => void;
  setTailAttached: (attached: boolean) => void;
}

/** The user-editable part of the filter; families + pills come from the
 * scope (spec §4.1) and are recompiled every render. */
interface UserFilter {
  text: string;
  radius: TimelineFilter["radius"];
  clearedBeforeSeq: number;
}

const EMPTY_USER_FILTER: UserFilter = {
  text: "",
  radius: null,
  clearedBeforeSeq: 0,
};

interface Reconstruction {
  state: InspectorState | null;
  error: string | null;
}

/** Owns the timeline's selection + filter state and the pinned-moment
 * reconstruction. Selection implies pause: "pinned" freezes the context pane
 * at that seq while the rows keep tailing live underneath; "follow" tracks
 * the tail. The navigation scope is an INPUT here — the tree owns it — and
 * compiles into the structural half of the filter. Reconstruction failures
 * are caught and surfaced as reconstructError. */
export function useTimeline(
  log: readonly LogRow[],
  history: LiveHistory,
  scope: Scope,
  presentState: InspectorState,
): TimelineModel {
  const [selection, setSelection] = useState<TimelineSelection>({
    mode: "follow",
  });
  const [userFilter, setUserFilter] = useState<UserFilter>(EMPTY_USER_FILTER);
  const [tailAttached, setTailAttached] = useState(true);

  // Declaration ORDER here is load-bearing for React Compiler memoization,
  // not cosmetic. The compiler merges a value's reactive scope with every
  // plain (non-function-expression) expression that reads it, and the merged
  // scope is keyed on the UNION of their dependencies. `pinnedRowHidden`
  // reads `rows`, so whatever sits between them is dragged into `rows`'
  // cache key — and `filterLog` is the one O(n) pass over a log that caps at
  // 5000 rows. Hoisting the selection-derived values ABOVE the filter keeps
  // `selection.mode`/`selection.row` out of that key (only the scalar
  // `pinnedSeq` survives) and leaves `selectedRow`, `pinnedRowEvicted`,
  // `pinnedBeforeClear`, `agedOut` and `reconstruction` in their own tight
  // scopes instead of one fused block. Measured with
  // `pnpm check:compiler`; re-measure before reordering.
  const pinnedSeq = selection.mode === "pinned" ? selection.seq : null;
  const selectedRow = selection.mode === "pinned" ? selection.row : null;
  const pinnedRowEvicted = pinnedSeq !== null && !hasSeq(log, pinnedSeq);

  const filter: TimelineFilter = {
    ...EMPTY_TIMELINE_FILTER,
    ...compileScope(scope, presentState),
    ...userFilter,
  };
  const rows = filterLog(log, filter);

  const pinnedRowHidden = pinnedSeq !== null && !hasSeq(rows, pinnedSeq);
  const pinnedBeforeClear =
    pinnedSeq !== null && pinnedSeq <= userFilter.clearedBeforeSeq;

  const agedOut =
    pinnedSeq !== null &&
    history.oldestSeq > 0 &&
    pinnedSeq <= history.oldestSeq;

  const reconstruction = computeReconstruction(pinnedSeq, agedOut, history);

  function pin(row: LogRow): void {
    setSelection({ mode: "pinned", seq: row.seq, row });
  }

  function resume(): void {
    setSelection({ mode: "follow" });
    setTailAttached(true);
  }

  function selectPrev(): void {
    setSelection((current) => {
      return stepped(rows, current, -1);
    });
  }

  function selectNext(): void {
    setSelection((current) => {
      return stepped(rows, current, 1);
    });
  }

  function setText(text: string): void {
    setUserFilter((prev) => {
      return { ...prev, text };
    });
  }

  function setRadiusAround(row: LogRow): void {
    setUserFilter((prev) => {
      return {
        ...prev,
        radius: { centerTs: row.ts, windowMs: RADIUS_WINDOW_MS },
      };
    });
  }

  function clearRadius(): void {
    setUserFilter((prev) => {
      return { ...prev, radius: null };
    });
  }

  function clear(): void {
    const latest = log[log.length - 1];

    if (latest === undefined) {
      return;
    }

    setUserFilter((prev) => {
      return { ...prev, clearedBeforeSeq: latest.seq };
    });
    setSelection({ mode: "follow" });
    setTailAttached(true);
  }

  function unclear(): void {
    setUserFilter((prev) => {
      return { ...prev, clearedBeforeSeq: 0 };
    });
  }

  return {
    selection,
    filter,
    rows,
    selectedRow,
    pinnedState: reconstruction.state,
    agedOut,
    reconstructError: reconstruction.error,
    pinnedRowEvicted,
    pinnedRowHidden,
    pinnedBeforeClear,
    tailAttached,
    pin,
    resume,
    selectPrev,
    selectNext,
    setText,
    setRadiusAround,
    clearRadius,
    clear,
    unclear,
    setTailAttached,
  };
}

function stepped(
  rows: readonly LogRow[],
  current: TimelineSelection,
  delta: 1 | -1,
): TimelineSelection {
  const last = rows[rows.length - 1];

  if (last === undefined) {
    return current;
  }

  if (current.mode === "follow") {
    return { mode: "pinned", seq: last.seq, row: last };
  }

  const seq = current.seq;
  const index = rows.findIndex((row) => {
    return row.seq === seq;
  });

  if (index === -1) {
    return { mode: "pinned", seq: last.seq, row: last };
  }

  const next = rows[Math.max(0, Math.min(index + delta, rows.length - 1))];

  return next === undefined
    ? current
    : { mode: "pinned", seq: next.seq, row: next };
}

function computeReconstruction(
  pinnedSeq: number | null,
  agedOut: boolean,
  history: LiveHistory,
): Reconstruction {
  if (pinnedSeq === null || agedOut) {
    return { state: null, error: null };
  }

  try {
    return { state: history.stateAt(pinnedSeq), error: null };
  } catch (error) {
    return { state: null, error: String(error) };
  }
}
