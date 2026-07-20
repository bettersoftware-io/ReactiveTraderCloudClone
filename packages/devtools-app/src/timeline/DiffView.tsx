import type { ReactElement } from "react";

import type { DiffEntry } from "@rtc/devtools-core";

import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/DiffView.module.css";

/** Renders diffSerialized output: one row per changed leaf — dotted path,
 * kind badge, before → after through the shared ValueView. */
export function DiffView({ entries, noPrior }: DiffViewProps): ReactElement {
  if (noPrior) {
    return <p className={styles.empty}>No prior value to diff against.</p>;
  }

  if (entries.length === 0) {
    return <p className={styles.empty}>No changes vs previous value.</p>;
  }

  return (
    <div className={styles.list}>
      {entries.map((entry) => {
        return <DiffRow key={entryKey(entry)} entry={entry} />;
      })}
    </div>
  );
}

export interface DiffViewProps {
  entries: readonly DiffEntry[];
  noPrior: boolean;
}

interface DiffRowProps {
  entry: DiffEntry;
}

function DiffRow({ entry }: DiffRowProps): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.path}>{pathLabel(entry)}</span>
      <span className={`${styles.kind} ${kindClass(entry.kind)}`}>
        {entry.kind}
      </span>
      {entry.kind !== "added" ? (
        <span className={styles.value}>
          <ValueView value={entry.before} depth={1} />
        </span>
      ) : null}
      {entry.kind === "changed" ? (
        <span className={styles.arrow}>→</span>
      ) : null}
      {entry.kind !== "removed" ? (
        <span className={styles.value}>
          <ValueView value={entry.after} depth={1} />
        </span>
      ) : null}
    </div>
  );
}

function entryKey(entry: DiffEntry): string {
  return `${JSON.stringify(entry.path)}:${entry.kind}`;
}

function pathLabel(entry: DiffEntry): string {
  return entry.path.length === 0 ? "(root)" : entry.path.join(".");
}

function kindClass(kind: DiffEntry["kind"]): string {
  if (kind === "added") {
    return styles.added;
  }

  if (kind === "removed") {
    return styles.removed;
  }

  return styles.changed;
}
