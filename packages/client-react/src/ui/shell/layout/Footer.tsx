import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";

import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <ConnectionStatusBar />
    </footer>
  );
}
