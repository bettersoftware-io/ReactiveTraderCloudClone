import type { ReactElement } from "react";

import styles from "#/layout/SplitHandle.module.css";
import type { SplitApi } from "#/layout/useSplit";

export interface SplitHandleProps {
  api: SplitApi;
}

export function SplitHandle(props: SplitHandleProps): ReactElement {
  const { api } = props;

  return (
    <div className={styles.handle} {...api.handleProps}>
      <div className={styles.grip} />
    </div>
  );
}
