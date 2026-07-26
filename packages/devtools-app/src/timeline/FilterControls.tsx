import type { ChangeEvent, ReactElement, RefObject } from "react";

import styles from "#/timeline/FilterControls.module.css";
import type { SourcePill, TimelineFamily } from "#/timeline/timelineModel";
import { pillKey } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** Rail-mounted filter stack: family toggles, active source pills (click a
 * source anywhere to add one), free text, and the ±100ms radius pill. Pills
 * OR within a layer; layers AND together (timelineModel.filterLog). */
export function FilterControls({
  model,
  textInputRef,
}: FilterControlsProps): ReactElement {
  return (
    <div className={styles.controls}>
      <input
        ref={textInputRef}
        type="text"
        className={styles.text}
        placeholder="Filter… ( / )"
        value={model.filter.text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          model.setText(e.target.value);
        }}
      />
      <div className={styles.families}>
        {FAMILIES.map((family) => {
          return <FamilyCheckbox key={family} family={family} model={model} />;
        })}
      </div>
      {model.filter.pills.length > 0 ? (
        <div className={styles.pills}>
          {model.filter.pills.map((pill) => {
            return <PillChip key={pillKey(pill)} pill={pill} model={model} />;
          })}
        </div>
      ) : null}
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

const FAMILIES: readonly TimelineFamily[] = [
  "stream",
  "machine",
  "wire",
  "devtools",
];

export interface FilterControlsProps {
  model: TimelineModel;
  textInputRef: RefObject<HTMLInputElement | null>;
}

interface FamilyCheckboxProps {
  family: TimelineFamily;
  model: TimelineModel;
}

function FamilyCheckbox({ family, model }: FamilyCheckboxProps): ReactElement {
  return (
    <label className={styles.family}>
      <input
        type="checkbox"
        checked={model.filter.families[family]}
        onChange={() => {
          model.toggleFamily(family);
        }}
      />
      {family}
    </label>
  );
}

interface PillChipProps {
  pill: SourcePill;
  model: TimelineModel;
}

function PillChip({ pill, model }: PillChipProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.pill}
      title="Remove filter"
      onClick={() => {
        model.removePill(pill);
      }}
    >
      {`${pill.id} ✕`}
    </button>
  );
}
