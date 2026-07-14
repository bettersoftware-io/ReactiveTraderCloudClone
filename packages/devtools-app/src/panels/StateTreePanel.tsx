import type { ReactElement } from "react";

import type { StreamRow } from "@rtc/devtools-core";

import styles from "#/panels/StateTreePanel.module.css";
import { ValueView } from "#/panels/ValueView";

/** The "State" tab: every instrumented stream, grouped by presenter (the
 * `streamId` substring before its FIRST `.` — e.g. `blotter.trades$` groups
 * under `blotter`; a method stream-id like `priceStream.price$[["EURUSD"]]`
 * still splits correctly since the double-bracket arg tuple comes after the
 * dot). Each row change-flashes its value span on a new `lastSeq`. */
export function StateTreePanel({ streams }: StateTreePanelProps): ReactElement {
  const groups = groupByPresenter(streams);

  return (
    <div className={styles.panel}>
      {groups.map((group) => {
        return <PresenterSection key={group.presenter} group={group} />;
      })}
    </div>
  );
}

export interface StateTreePanelProps {
  streams: readonly StreamRow[];
}

interface PresenterGroup {
  presenter: string;
  rows: readonly StreamRow[];
}

interface PresenterSectionProps {
  group: PresenterGroup;
}

function PresenterSection({ group }: PresenterSectionProps): ReactElement {
  return (
    <section className={styles.group}>
      <h3 className={styles.groupTitle}>{group.presenter}</h3>
      <div className={styles.rows}>
        {group.rows.map((row) => {
          return <StreamRowView key={row.streamId} row={row} />;
        })}
      </div>
    </section>
  );
}

interface StreamRowViewProps {
  row: StreamRow;
}

function StreamRowView({ row }: StreamRowViewProps): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.streamId}>{row.streamId}</span>
      {/* Remounting on a new lastSeq restarts the 300ms opacity-only
       * @keyframes below — compositor-safe per docs/performance.md (P2):
       * never animate width/color/box-shadow/transform-with-var here. */}
      <span key={row.lastSeq} className={styles.flash}>
        <ValueView value={row.lastValue} />
      </span>
      {row.ratePerSec > 0.5 ? (
        <span className={styles.rate}>{`${row.ratePerSec.toFixed(1)}/s`}</span>
      ) : null}
    </div>
  );
}

function groupByPresenter(streams: readonly StreamRow[]): PresenterGroup[] {
  const order: string[] = [];
  const byPresenter = new Map<string, StreamRow[]>();

  for (const row of streams) {
    const presenter = presenterOf(row.streamId);
    const existing = byPresenter.get(presenter);

    if (existing) {
      existing.push(row);
    } else {
      byPresenter.set(presenter, [row]);
      order.push(presenter);
    }
  }

  return order.map((presenter) => {
    return { presenter, rows: byPresenter.get(presenter) ?? [] };
  });
}

function presenterOf(streamId: string): string {
  const i = streamId.indexOf(".");

  return i === -1 ? streamId : streamId.slice(0, i);
}
