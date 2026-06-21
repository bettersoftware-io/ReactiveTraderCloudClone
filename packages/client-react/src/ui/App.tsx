import { useState } from "react";
import styles from "./App.module.css";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import { Footer } from "./shell/layout/Footer";
import { Header, type WorkspaceTab } from "./shell/layout/Header";
import { Workspace } from "./shell/layout/Workspace";

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("fx");

  return (
    <div className={styles.app}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <Workspace activeTab={activeTab} />
      <Footer />
      <ConnectionOverlay />
    </div>
  );
}
