import type { ReactElement } from "react";

import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";

import styles from "./Footer.module.css";

export function Footer(): ReactElement {
  return (
    <footer className={styles.footer}>
      <ConnectionStatusBar />
    </footer>
  );
}
