import type { JSX } from "solid-js";

import styles from "./TileFooter.module.css";

export function TileFooter(props: TileFooterProps): JSX.Element {
  return (
    <div class={styles.footer}>
      <span class={styles.spotDate}>SPT {props.spotDate}</span>
      <span class={styles.notional}>
        {props.notional} {props.baseCurrency}
      </span>
    </div>
  );
}

interface TileFooterProps {
  spotDate: string;
  notional: string;
  baseCurrency: string;
}
