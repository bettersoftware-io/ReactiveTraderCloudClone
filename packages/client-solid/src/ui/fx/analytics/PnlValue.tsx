import type { JSX } from "solid-js";
import { createMemo } from "solid-js";

import { formatPnlHeadline } from "@rtc/domain";

import styles from "./PnlValue.module.css";

export function PnlValue(props: PnlValueProps): JSX.Element {
  const sign = createMemo((): "pos" | "neg" => {
    return props.value >= 0 ? "pos" : "neg";
  });

  return (
    <div data-sign={sign()} class={styles.value}>
      <span class={styles.amount} data-testid="lastPosition">
        {formatPnlHeadline(props.value)}
      </span>
    </div>
  );
}

interface PnlValueProps {
  value: number;
}
