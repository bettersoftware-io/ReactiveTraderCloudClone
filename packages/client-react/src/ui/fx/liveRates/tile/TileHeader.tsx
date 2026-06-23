import type { ReactElement } from "react";

import styles from "./TileHeader.module.css";

interface TileHeaderProps {
  base: string;
  terms: string;
}

export function TileHeader({ base, terms }: TileHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <span>{base}</span>
      <span className={styles.separator}>/</span>
      <span>{terms}</span>
    </div>
  );
}
