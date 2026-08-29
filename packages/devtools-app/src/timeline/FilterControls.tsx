import type { ChangeEvent, ReactElement, RefObject } from "react";

import styles from "#/timeline/FilterControls.module.css";
import type { TimelineModel } from "#/timeline/useTimeline";

/** Rail-mounted filter stack: free text and the ±100ms radius pill. The
 * source constraint itself now comes from the navigation scope (spec §4.1),
 * compiled into `model.filter` — this bar only edits the user-typed half. */
export function FilterControls({
  model,
  textInputRef,
}: FilterControlsProps): ReactElement {
  function changeTimelineFilter(e: ChangeEvent<HTMLInputElement>): void {
    model.setText(e.target.value);
  }

  return (
    <div className={styles.controls}>
      <input
        ref={textInputRef}
        type="text"
        className={styles.text}
        placeholder="Filter… ( / )"
        value={model.filter.text}
        onChange={changeTimelineFilter}
      />
      {model.filter.radius !== null ? (
        <button
          type="button"
          className={styles.pill}
          title="Clear radius filter"
          onClick={model.clearRadius}
        >
          {`±${model.filter.radius.windowMs}ms ✕`}
        </button>
      ) : null}
    </div>
  );
}

export interface FilterControlsProps {
  model: TimelineModel;
  textInputRef: RefObject<HTMLInputElement | null>;
}
