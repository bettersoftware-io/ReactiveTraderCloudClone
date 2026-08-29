import type { ChangeEvent, ReactElement, RefObject, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { LogRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { shortLabel } from "#/nav/scope";
import { formatLogTime } from "#/panels/formatLogTime";
import styles from "#/timeline/TimelinePane.module.css";
import { familyOf, sourceOfEvent } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** The actions list (spec §4): the chronological rows of the current scope,
 * a header (scoped search, Clear/Unclear, radius chip), and the pinned bar.
 * Follow mode auto-scrolls to the tail ONLY while the pane is at the bottom
 * (§6.1, the log-viewer rule): scrolling up detaches silently, a "⤓ live"
 * chip re-attaches, and while detached the ≤500-row render window anchors
 * to the first visible row instead of the tail so rows stop remounting
 * under the cursor — which is what makes whole-row click-to-pin safe. */
export function TimelinePane({
  model,
  scope,
  searchInputRef,
  onProbeWire,
  onShowInAll,
}: TimelinePaneProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchorSeq, setAnchorSeq] = useState<number | null>(null);
  const following = model.selection.mode === "follow";
  const pinnedSeq =
    model.selection.mode === "pinned" ? model.selection.seq : null;
  const centerSeq = pinnedSeq ?? (model.tailAttached ? null : anchorSeq);
  const visible = windowedRows(model.rows, centerSeq);

  useEffect((): void => {
    if (
      following &&
      model.tailAttached &&
      visible.length > 0 &&
      scrollRef.current
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [following, model.tailAttached, visible]);

  function trackScrollPosition(e: UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_EPSILON_PX;

    if (atBottom !== model.tailAttached) {
      model.setTailAttached(atBottom);
    }

    if (!atBottom) {
      setAnchorSeq(firstVisibleSeq(el));
    }
  }

  function reattachTail(): void {
    model.setTailAttached(true);
  }

  return (
    <div className={styles.pane}>
      <PaneHeader model={model} searchInputRef={searchInputRef} />
      {pinnedSeq !== null ? (
        <PinnedBar
          model={model}
          pinnedSeq={pinnedSeq}
          onProbeWire={onProbeWire}
          onShowInAll={onShowInAll}
        />
      ) : null}
      <div
        ref={scrollRef}
        data-testid="timeline-rows"
        className={styles.rows}
        onScroll={trackScrollPosition}
      >
        {visible.map((row) => {
          return (
            <TimelineRowView
              key={row.seq}
              row={row}
              scope={scope}
              model={model}
              pinnedSeq={pinnedSeq}
              onProbeWire={onProbeWire}
            />
          );
        })}
      </div>
      {following && !model.tailAttached ? (
        <button
          type="button"
          data-testid="live-chip"
          className={styles.liveChip}
          onClick={reattachTail}
        >
          ⤓ live
        </button>
      ) : null}
    </div>
  );
}

const MAX_RENDERED_ROWS = 500;
const HALF_WINDOW = 250;
const BOTTOM_EPSILON_PX = 8;

export interface TimelinePaneProps {
  model: TimelineModel;
  scope: Scope;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onProbeWire: (row: LogRow) => void;
  onShowInAll: () => void;
}

interface PaneHeaderProps {
  model: TimelineModel;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

function PaneHeader({ model, searchInputRef }: PaneHeaderProps): ReactElement {
  function changeScopeSearch(e: ChangeEvent<HTMLInputElement>): void {
    model.setText(e.target.value);
  }

  return (
    <div className={styles.header}>
      <input
        ref={searchInputRef}
        type="text"
        className={styles.search}
        placeholder="Search scope… ( / )"
        value={model.filter.text}
        onChange={changeScopeSearch}
      />
      {model.filter.radius !== null ? (
        <button
          type="button"
          className={styles.chip}
          title="Clear radius filter"
          onClick={model.clearRadius}
        >
          {`±${model.filter.radius.windowMs}ms @ ${formatLogTime(model.filter.radius.centerTs)} ✕`}
        </button>
      ) : null}
      <button
        type="button"
        data-testid="clear-log"
        className={styles.headerButton}
        title="Hide everything before now (c)"
        onClick={model.clear}
      >
        Clear
      </button>
      {model.filter.clearedBeforeSeq > 0 ? (
        <button
          type="button"
          data-testid="unclear-log"
          className={styles.headerButton}
          title="Show the hidden rows again"
          onClick={model.unclear}
        >
          Unclear
        </button>
      ) : null}
    </div>
  );
}

interface PinnedBarProps {
  model: TimelineModel;
  pinnedSeq: number;
  onProbeWire: (row: LogRow) => void;
  onShowInAll: () => void;
}

function PinnedBar({
  model,
  pinnedSeq,
  onProbeWire,
  onShowInAll,
}: PinnedBarProps): ReactElement {
  const row = model.selectedRow;

  function probeWireAroundPin(): void {
    if (row !== null) {
      onProbeWire(row);
    }
  }

  return (
    <div className={styles.pinnedBar} data-testid="pinned-bar">
      <span
        className={styles.pinnedLabel}
      >{`⏸ ${pinnedLabel(model, pinnedSeq)}`}</span>
      {model.pinnedRowHidden && !model.agedOut ? (
        <button
          type="button"
          data-testid="show-in-all"
          className={styles.resume}
          onClick={onShowInAll}
        >
          show in All
        </button>
      ) : null}
      {row !== null && model.filter.radius === null ? (
        <button
          type="button"
          className={styles.resume}
          onClick={probeWireAroundPin}
        >
          wire ±100ms
        </button>
      ) : null}
      <button type="button" className={styles.resume} onClick={model.resume}>
        Resume
      </button>
    </div>
  );
}

interface TimelineRowViewProps {
  row: LogRow;
  scope: Scope;
  model: TimelineModel;
  pinnedSeq: number | null;
  onProbeWire: (row: LogRow) => void;
}

function TimelineRowView({
  row,
  scope,
  model,
  pinnedSeq,
  onProbeWire,
}: TimelineRowViewProps): ReactElement {
  const source = sourceOfEvent(row.event);
  const isSelected = pinnedSeq === row.seq;
  const isDimmed = pinnedSeq !== null && row.seq > pinnedSeq;
  const sourceLabel = sourceLabelFor(
    source?.type ?? null,
    source?.id ?? null,
    scope,
  );

  const rowClassName = isSelected
    ? `${styles.row} ${styles.rowSelected}`
    : isDimmed
      ? `${styles.row} ${styles.rowDimmed}`
      : styles.row;

  function pinTimelineRow(): void {
    model.pin(row);
  }

  function probeWireAroundRow(): void {
    onProbeWire(row);
  }

  return (
    <div
      data-testid="timeline-row"
      data-seq={row.seq}
      data-family={familyOf(row.kind)}
      className={rowClassName}
    >
      <button type="button" className={styles.pinArea} onClick={pinTimelineRow}>
        <span className={styles.time}>{formatLogTime(row.ts)}</span>
        <span className={styles.kindChip}>{row.kind}</span>
        <span className={styles.summary}>{row.summary}</span>
        {sourceLabel !== null ? (
          <span className={styles.source} title={source?.id}>
            {sourceLabel}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        title="Show wire traffic within ±100 ms"
        className={styles.radius}
        onClick={probeWireAroundRow}
      >
        wire ±100ms
      </button>
    </div>
  );
}

/** Under a single-source scope the source column collapses (§4.2); under a
 * presenter it is the leaf label; elsewhere the full id. */
function sourceLabelFor(
  type: "stream" | "machine" | "msgType" | null,
  id: string | null,
  scope: Scope,
): string | null {
  if (type === null || id === null) {
    return null;
  }

  if (
    scope.kind === "stream" ||
    scope.kind === "machine" ||
    scope.kind === "msgType"
  ) {
    return null;
  }

  return type === "stream" ? shortLabel(id, scope) : id;
}

function pinnedLabel(model: TimelineModel, pinnedSeq: number): string {
  if (model.agedOut) {
    return "this moment left the buffer";
  }

  const time = model.selectedRow
    ? formatLogTime(model.selectedRow.ts)
    : `#${pinnedSeq}`;

  const qualifier = model.pinnedBeforeClear
    ? " (before clear)"
    : model.pinnedRowEvicted
      ? " (evicted from log)"
      : "";
  const hidden = model.pinnedRowHidden ? " — not in this scope" : "";

  return `pinned at ${time}${qualifier}${hidden}`;
}

function firstVisibleSeq(el: HTMLDivElement): number | null {
  for (const child of Array.from(el.children)) {
    const element = child as HTMLElement;

    if (element.offsetTop + element.offsetHeight > el.scrollTop) {
      const seq = Number(element.dataset.seq);

      return Number.isFinite(seq) ? seq : null;
    }
  }

  const first = el.children[0] as HTMLElement | undefined;
  const seq = Number(first?.dataset.seq);

  return Number.isFinite(seq) ? seq : null;
}

function windowedRows(
  rows: readonly LogRow[],
  centerSeq: number | null,
): readonly LogRow[] {
  if (centerSeq === null) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  const index = rows.findIndex((row) => {
    return row.seq >= centerSeq;
  });

  if (index === -1) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  return rows.slice(Math.max(0, index - HALF_WINDOW), index + HALF_WINDOW);
}
