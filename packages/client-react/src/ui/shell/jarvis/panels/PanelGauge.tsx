import type { ReactElement } from "react";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb single-value readout: label + big value + signed delta, tone-coloured. */
export function PanelGauge({
  label,
  value,
  delta,
  tone,
}: PanelGaugeProps): ReactElement {
  return (
    <div data-testid="jarvis-panel-gauge" className={styles.gauge}>
      <div className={styles.gaugeLabel}>{label}</div>
      <div className={styles.gaugeValue} data-tone={tone}>
        <span key={value} className={styles.flashOnChange}>
          {value}
        </span>
      </div>
      <div className={styles.gaugeDelta} data-tone={tone}>
        <span key={delta} className={styles.flashOnChange}>
          {delta}
        </span>
      </div>
    </div>
  );
}

// A named tag (rather than an inline `{ kind: "gauge" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument — the
// repo's `no-restricted-syntax` bans that even inside a type alias (mirrors
// JarvisMachine.ts's `ConfirmRequestTag`).
interface GaugeKindTag {
  readonly kind: "gauge";
}
export type PanelGaugeProps = Extract<PanelData, GaugeKindTag>;
