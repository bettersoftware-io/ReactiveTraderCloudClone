import type { JSX } from "solid-js";

import styles from "./SpreadDisplay.module.css";

export function SpreadDisplay(props: SpreadDisplayProps): JSX.Element {
  return <div class={styles.spread}>{props.spread}</div>;
}

interface SpreadDisplayProps {
  spread: string;
}
