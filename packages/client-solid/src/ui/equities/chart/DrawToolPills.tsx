import { For, type JSX } from "solid-js";

import type { EqDrawTool } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The trendline/horizontal-level draw-tool selector — a `TimeframePills`
 * clone (reuses its module-css shape verbatim), with one behavioural twist
 * `ChartTypePills` doesn't have: clicking the already-active pill toggles
 * back to `"cursor"` instead of staying selected, since a draw tool is a
 * momentary mode (draw one shape, then you're back to pointing) rather than
 * a persistent choice like chart kind. */
export function DrawToolPills(props: DrawToolPillsProps): JSX.Element {
  return (
    <div class={styles.pills}>
      <For each={DRAW_TOOLS}>
        {(t: DrawToolOption): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-draw-pill"
              data-tool={t.id}
              data-active={String(t.id === props.tool)}
              onClick={() => {
                props.onSet(t.id === props.tool ? "cursor" : t.id);
              }}
            >
              {t.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}

interface DrawToolOption {
  id: Exclude<EqDrawTool, "cursor">;
  label: string;
}

const DRAW_TOOLS: readonly DrawToolOption[] = [
  { id: "trendline", label: "TL" },
  { id: "hline", label: "H-LINE" },
];

export interface DrawToolPillsProps {
  tool: EqDrawTool;
  onSet: (tool: EqDrawTool) => void;
}
