import { useState } from "react";
import { Header, type WorkspaceTab } from "./shell/layout/Header";
import { Footer } from "./shell/layout/Footer";
import { Workspace } from "./shell/layout/Workspace";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
import styles from "./App.module.css";

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
