import { useState } from "react";
import { Header, type WorkspaceTab } from "./shell/layout/Header";
import { Footer } from "./shell/layout/Footer";
import { Workspace } from "./shell/layout/Workspace";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("fx");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <Workspace activeTab={activeTab} />
      <Footer />
      <ConnectionOverlay />
    </div>
  );
}
