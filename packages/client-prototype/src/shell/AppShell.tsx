import type { ReactElement, ReactNode } from "react";

import styles from "#/shell/AppShell.module.css";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell(props: AppShellProps): ReactElement {
  const { children } = props;
  return (
    <div className={styles.shell}>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
