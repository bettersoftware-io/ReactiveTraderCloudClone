import type { ReactElement } from "react";

import styles from "./SpreadDisplay.module.css";

export function SpreadDisplay({ spread }: SpreadDisplayProps): ReactElement {
  return <div className={styles.spread}>{spread}</div>;
}

interface SpreadDisplayProps {
  spread: string;
}
