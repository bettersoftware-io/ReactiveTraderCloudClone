import type { CSSProperties, ReactElement } from "react";
import { Fragment } from "react";

import { statusItems } from "#/mock/shellData";
import type { StatusItem } from "#/mock/types";
import { useClock } from "#/mock/useClock";
import styles from "#/shell/StatusBar/StatusBar.module.css";

export function StatusBar(): ReactElement {
  const clock = useClock();
  return (
    <footer className={styles.footer}>
      <div className={styles.dot} />
      <span className={styles.connected}>CONNECTED</span>
      <span className={styles.sep}>│</span>
      <span className={styles.gateway}>GW eu-west-1</span>
      {statusItems.map((item: StatusItem) => {
        const itemStyle = { "--item-color": item.color } as CSSProperties;
        return (
          <Fragment key={item.label}>
            <span className={styles.sep}>│</span>
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemValue} style={itemStyle}>
              {item.value}
            </span>
          </Fragment>
        );
      })}
      <div className={styles.spacer} />
      <span className={styles.build}>BUILD v4.0.1</span>
      <span className={styles.sep}>│</span>
      <span className={styles.clock}>{clock} UTC</span>
    </footer>
  );
}
