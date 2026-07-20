import type { MouseEvent, ReactElement } from "react";
import { useEffect, useRef } from "react";

import type { LogRow } from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import styles from "#/timeline/TimelinePane.module.css";
import { familyOf, sourceOfEvent } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** The left pane: one chronological, color-coded list of every event family.
 * Selection implies pause — clicking a row pins the inspector at that moment
 * (the tail keeps accumulating below, dimmed); Resume/Esc snaps back to live.
 * Windowed to ≤500 rendered rows (slice, not a virtualization dep): the last
 * 500 while following, 250 either side of the pin while pinned. */
export function TimelinePane({ model }: TimelinePaneProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = model.selection.mode === "follow";
  const pinnedSeq =
    model.selection.mode === "pinned" ? model.selection.seq : null;
  const visible = windowedRows(model.rows, pinnedSeq);

  useEffect((): void => {
    if (following && visible.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [following, visible]);

  return (
    <div className={styles.pane}>
      {pinnedSeq !== null ? (
        <PinnedBar model={model} pinnedSeq={pinnedSeq} />
      ) : null}
      <div ref={scrollRef} className={styles.rows}>
        {visible.map((row) => {
          return (
            <TimelineRowView
              key={row.seq}
              row={row}
              model={model}
              pinnedSeq={pinnedSeq}
            />
          );
        })}
      </div>
    </div>
  );
}

const MAX_RENDERED_ROWS = 500;
const HALF_WINDOW = 250;

export interface TimelinePaneProps {
  model: TimelineModel;
}

interface PinnedBarProps {
  model: TimelineModel;
  pinnedSeq: number;
}

function PinnedBar({ model, pinnedSeq }: PinnedBarProps): ReactElement {
  const label = model.agedOut
    ? "this moment left the buffer"
    : `pinned at ${model.selectedRow ? formatLogTime(model.selectedRow.ts) : `#${pinnedSeq}`}`;

  return (
    <div className={styles.pinnedBar} data-testid="pinned-bar">
      <span className={styles.pinnedLabel}>{`⏸ ${label}`}</span>
      <button type="button" className={styles.resume} onClick={model.resume}>
        Resume
      </button>
    </div>
  );
}

interface TimelineRowViewProps {
  row: LogRow;
  model: TimelineModel;
  pinnedSeq: number | null;
}

function TimelineRowView({
  row,
  model,
  pinnedSeq,
}: TimelineRowViewProps): ReactElement {
  const source = sourceOfEvent(row.event);
  const isSelected = pinnedSeq === row.seq;
  const isDimmed = pinnedSeq !== null && row.seq > pinnedSeq;

  const rowClassName = isSelected
    ? `${styles.row} ${styles.rowSelected}`
    : isDimmed
      ? `${styles.row} ${styles.rowDimmed}`
      : styles.row;

  function handleClick(): void {
    model.pin(row.seq);
  }

  function handleSourceClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();

    if (source !== null) {
      model.addPill(source);
    }
  }

  function handleRadiusClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    model.setRadiusAround(row);
  }

  return (
    <button
      type="button"
      data-testid="timeline-row"
      data-seq={row.seq}
      data-family={familyOf(row.kind)}
      className={rowClassName}
      onClick={handleClick}
    >
      <span className={styles.time}>{formatLogTime(row.ts)}</span>
      <span className={styles.kindChip}>{row.kind}</span>
      {source !== null ? (
        <button
          type="button"
          title="Filter to this source"
          className={styles.source}
          onClick={handleSourceClick}
        >
          {source.id}
        </button>
      ) : null}
      <span className={styles.summary}>{row.summary}</span>
      <button
        type="button"
        title="Show events within ±100 ms"
        className={styles.radius}
        onClick={handleRadiusClick}
      >
        ±100ms
      </button>
    </button>
  );
}

function windowedRows(
  rows: readonly LogRow[],
  pinnedSeq: number | null,
): readonly LogRow[] {
  if (pinnedSeq === null) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  const index = rows.findIndex((row) => {
    return row.seq >= pinnedSeq;
  });

  if (index === -1) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  return rows.slice(Math.max(0, index - HALF_WINDOW), index + HALF_WINDOW);
}
