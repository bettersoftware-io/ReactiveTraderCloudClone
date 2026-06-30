import type { ReactElement, ReactNode } from "react";

import styles from "#/shell/AppShell.module.css";
import { AmbientBackground } from "#/shell/ambient/AmbientBackground";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell(props: AppShellProps): ReactElement {
  const { children } = props;
  return (
    <div className={styles.shell}>
      <AmbientBackground />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
