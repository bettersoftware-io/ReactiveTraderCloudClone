import styles from "./Footer.module.css";
import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <ConnectionStatusBar />
    </footer>
  );
}
