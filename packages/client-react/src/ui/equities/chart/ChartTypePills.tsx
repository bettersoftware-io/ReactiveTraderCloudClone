import type { ReactElement } from "react";

import type { EqChartType } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The candles/line/area chart-kind selector — a `TimeframePills` clone over
 * a different id/label set (reuses its module-css shape verbatim). */
export function ChartTypePills({
  kind,
  onSet,
}: ChartTypePillsProps): ReactElement {
  return (
    <div className={styles.pills}>
      {CHART_TYPES.map((id) => {
        return (
          <button
            key={id.id}
            type="button"
            className={styles.pill}
            data-testid="chart-type-pill"
            data-kind={id.id}
            data-active={String(id.id === kind)}
            onClick={() => {
              onSet(id.id);
            }}
          >
            {id.label}
          </button>
        );
      })}
    </div>
  );
}

interface ChartTypeOption {
  id: EqChartType;
  label: string;
}

const CHART_TYPES: readonly ChartTypeOption[] = [
  { id: "candles", label: "CANDLES" },
  { id: "line", label: "LINE" },
  { id: "area", label: "AREA" },
];

export interface ChartTypePillsProps {
  kind: EqChartType;
  onSet: (kind: EqChartType) => void;
}
