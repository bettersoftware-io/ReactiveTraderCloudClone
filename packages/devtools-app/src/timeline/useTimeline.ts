import { useCallback, useMemo, useState } from "react";

import type { InspectorState, LiveHistory, LogRow } from "@rtc/devtools-core";

import type {
  SourcePill,
  TimelineFamily,
  TimelineFilter,
} from "#/timeline/timelineModel";
import {
  EMPTY_TIMELINE_FILTER,
  filterLog,
  pillKey,
  RADIUS_WINDOW_MS,
} from "#/timeline/timelineModel";

export type TimelineSelection =
  | { mode: "follow" }
  | { mode: "pinned"; seq: number };

export interface TimelineModel {
  selection: TimelineSelection;
  filter: TimelineFilter;
  rows: readonly LogRow[];
  selectedRow: LogRow | null;
  pinnedState: InspectorState | null;
  agedOut: boolean;
  reconstructError: string | null;
  pin: (seq: number) => void;
  resume: () => void;
  selectPrev: () => void;
  selectNext: () => void;
  toggleFamily: (family: TimelineFamily) => void;
  addPill: (pill: SourcePill) => void;
  removePill: (pill: SourcePill) => void;
  setText: (text: string) => void;
  setRadiusAround: (row: LogRow) => void;
  clearRadius: () => void;
}

interface Reconstruction {
  state: InspectorState | null;
  error: string | null;
}

/** Owns the timeline's selection + filter state and the pinned-moment
 * reconstruction. Selection implies pause: "pinned" freezes the context pane
 * at that seq while the rows keep tailing live underneath; "follow" (nothing
 * selected) tracks the tail. Reconstruction failures are caught here and
 * surfaced as reconstructError — the pane renders an error card, never a
 * blank panel. */
export function useTimeline(
  log: readonly LogRow[],
  history: LiveHistory,
): TimelineModel {
  const [selection, setSelection] = useState<TimelineSelection>({
    mode: "follow",
  });
  const [filter, setFilter] = useState<TimelineFilter>(EMPTY_TIMELINE_FILTER);

  const rows = useMemo(() => {
    return filterLog(log, filter);
  }, [log, filter]);

  const selectedRow = useMemo(() => {
    if (selection.mode !== "pinned") {
      return null;
    }

    const seq = selection.seq;

    return (
      log.find((row) => {
        return row.seq === seq;
      }) ?? null
    );
  }, [log, selection]);

  const agedOut =
    selection.mode === "pinned" &&
    history.oldestSeq > 0 &&
    selection.seq <= history.oldestSeq;

  const reconstruction = useMemo((): Reconstruction => {
    if (selection.mode !== "pinned" || agedOut) {
      return { state: null, error: null };
    }

    try {
      return { state: history.stateAt(selection.seq), error: null };
    } catch (error) {
      return { state: null, error: String(error) };
    }
  }, [selection, agedOut, history]);

  const pin = useCallback((seq: number): void => {
    setSelection({ mode: "pinned", seq });
  }, []);

  const resume = useCallback((): void => {
    setSelection({ mode: "follow" });
  }, []);

  const selectPrev = useCallback((): void => {
    setSelection((current) => {
      return stepped(rows, current, -1);
    });
  }, [rows]);

  const selectNext = useCallback((): void => {
    setSelection((current) => {
      return stepped(rows, current, 1);
    });
  }, [rows]);

  const toggleFamily = useCallback((family: TimelineFamily): void => {
    setFilter((prev) => {
      return {
        ...prev,
        families: { ...prev.families, [family]: !prev.families[family] },
      };
    });
  }, []);

  const addPill = useCallback((pill: SourcePill): void => {
    setFilter((prev) => {
      const exists = prev.pills.some((p) => {
        return pillKey(p) === pillKey(pill);
      });

      return exists ? prev : { ...prev, pills: [...prev.pills, pill] };
    });
  }, []);

  const removePill = useCallback((pill: SourcePill): void => {
    setFilter((prev) => {
      return {
        ...prev,
        pills: prev.pills.filter((p) => {
          return pillKey(p) !== pillKey(pill);
        }),
      };
    });
  }, []);

  const setText = useCallback((text: string): void => {
    setFilter((prev) => {
      return { ...prev, text };
    });
  }, []);

  const setRadiusAround = useCallback((row: LogRow): void => {
    setFilter((prev) => {
      return {
        ...prev,
        radius: { centerTs: row.ts, windowMs: RADIUS_WINDOW_MS },
      };
    });
  }, []);

  const clearRadius = useCallback((): void => {
    setFilter((prev) => {
      return { ...prev, radius: null };
    });
  }, []);

  return {
    selection,
    filter,
    rows,
    selectedRow,
    pinnedState: reconstruction.state,
    agedOut,
    reconstructError: reconstruction.error,
    pin,
    resume,
    selectPrev,
    selectNext,
    toggleFamily,
    addPill,
    removePill,
    setText,
    setRadiusAround,
    clearRadius,
  };
}

function stepped(
  rows: readonly LogRow[],
  current: TimelineSelection,
  delta: 1 | -1,
): TimelineSelection {
  if (rows.length === 0) {
    return current;
  }

  if (current.mode === "follow") {
    const last = rows[rows.length - 1];

    return last === undefined ? current : { mode: "pinned", seq: last.seq };
  }

  const seq = current.seq;
  const index = rows.findIndex((row) => {
    return row.seq === seq;
  });

  if (index === -1) {
    const last = rows[rows.length - 1];

    return last === undefined ? current : { mode: "pinned", seq: last.seq };
  }

  const next = rows[Math.max(0, Math.min(index + delta, rows.length - 1))];

  return next === undefined ? current : { mode: "pinned", seq: next.seq };
}
