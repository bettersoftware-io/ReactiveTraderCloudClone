import type { JSX } from "solid-js";
import { Show } from "solid-js";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb single-value readout: label + big value + signed delta, tone-coloured.
 * The value/delta spans are individually `<Show keyed>`-wrapped (the Solid
 * analogue of React's `key={value}` remount — see WatchlistRow.tsx) so each
 * one's `.flashOnChange` CSS animation retriggers only when ITS OWN text
 * genuinely changes, not on every render. */
export function PanelGauge(props: PanelGaugeProps): JSX.Element {
  return (
    <div data-testid="jarvis-panel-gauge" class={styles.gauge}>
      <div class={styles.gaugeLabel}>{props.label}</div>
      <div class={styles.gaugeValue} data-tone={props.tone}>
        <Show when={props.value} keyed>
          {(value: string): JSX.Element => {
            return <span class={styles.flashOnChange}>{value}</span>;
          }}
        </Show>
      </div>
      <div class={styles.gaugeDelta} data-tone={props.tone}>
        <Show when={props.delta} keyed>
          {(delta: string): JSX.Element => {
            return <span class={styles.flashOnChange}>{delta}</span>;
          }}
        </Show>
      </div>
    </div>
  );
}

// A named tag (rather than an inline `{ kind: "gauge" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// react's PanelGauge.tsx / JarvisMachine.ts's `ConfirmRequestTag`).
interface GaugeKindTag {
  readonly kind: "gauge";
}
export type PanelGaugeProps = Extract<PanelData, GaugeKindTag>;
