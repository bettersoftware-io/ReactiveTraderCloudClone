import { For, type JSX } from "solid-js";

import type { EqChartType } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The candles/line/area chart-kind selector — a `TimeframePills` clone over
 * a different id/label set (reuses its module-css shape verbatim). */
export function ChartTypePills(props: ChartTypePillsProps): JSX.Element {
  function selectChartType(next: EqChartType) {
    return () => {
      props.onSet(next);
    };
  }

  return (
    <div class={styles.pills}>
      <For each={CHART_TYPES}>
        {(opt: ChartTypeOption): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-type-pill"
              data-kind={opt.id}
              data-active={String(opt.id === props.kind)}
              onClick={selectChartType(opt.id)}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
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
